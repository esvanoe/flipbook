import type { FastifyInstance } from 'fastify';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../../utils/logger.js';

/**
 * Setup admin panel route
 */
export function setupAdminRoute(app: FastifyInstance): void {
  app.get('/admin', async (_request, reply) => {
    try {
      // Try to serve the built HTML file first
      const builtHtmlPath = join(process.cwd(), 'dist/client/admin/index.html');
      
      if (existsSync(builtHtmlPath)) {
        const html = readFileSync(builtHtmlPath, 'utf-8');
        // Update asset paths to use /client/ prefix
        const updatedHtml = html
          .replace(/href="\.\//g, 'href="/client/admin/')
          .replace(/src="\.\//g, 'src="/client/admin/')
          .replace(/href="\/assets\//g, 'href="/client/assets/')
          .replace(/src="\/assets\//g, 'src="/client/assets/');
        return reply.type('text/html').send(updatedHtml);
      }

      // Fallback: serve error message
      return reply.code(404).send({ error: 'Admin panel not built. Run npm run build first.' });
    } catch (error) {
      logger.error('Error serving admin page:', error);
      return reply.code(500).send({ error: 'Failed to load admin page' });
    }
  });
}

