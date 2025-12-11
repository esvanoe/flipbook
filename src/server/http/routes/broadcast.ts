import type { FastifyInstance } from 'fastify';
import { readFileSync } from 'fs';
import { join } from 'path';
import { config } from '../../config/config.js';
import { logger } from '../../utils/logger.js';

/**
 * Setup broadcast route for browser screen capture
 */
export function setupBroadcastRoute(app: FastifyInstance): void {
  app.get('/broadcast', async (request, reply) => {
    const browserId = (request.query as { id?: string }).id;

    if (!browserId) {
      return reply.code(400).send({ error: 'Browser ID required' });
    }

    try {
      // Read broadcast HTML template
      const broadcastScriptPath = join(process.cwd(), 'src/client/broadcast/broadcast.ts');
      const broadcastScript = readFileSync(broadcastScriptPath, 'utf-8');

      // Inject ICE servers configuration
      const iceServersJson = JSON.stringify({
        stunServers: config.webrtc.stunServers.map((s) => ({ urls: s.urls })),
        turnServers: config.webrtc.turnServers?.map((t) => ({
          urls: t.urls,
          username: t.username,
          credential: t.credential,
        })),
      });

      // Create HTML page with broadcast script
      const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Broadcast - ${browserId}</title>
    <meta charset="utf-8">
    <script src="/socket.io/socket.io.js"></script>
</head>
<body>
    <div id="status">Initializing broadcast...</div>
    <script>
        // Inject ICE servers
        window.ICE_SERVERS = ${iceServersJson};
        
        // Load broadcast script
        ${broadcastScript}
    </script>
</body>
</html>
      `.trim();

      return reply.type('text/html').send(html);
    } catch (error) {
      logger.error('Error serving broadcast page:', error);
      return reply.code(500).send({ error: 'Failed to load broadcast page' });
    }
  });
}

