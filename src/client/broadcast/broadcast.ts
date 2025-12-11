// Browser-side WebRTC broadcast script
// This script runs in the browser instance to capture screen and stream via WebRTC
// @ts-nocheck - This is browser-side code, types are available at runtime

interface BroadcastConfig {
  browserId: string;
  serverUrl: string;
  iceServers: RTCIceServer[];
}

class BroadcastManager {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private socket: any = null;
  private browserId: string;
  private serverUrl: string;
  private iceServers: RTCIceServer[];

  constructor(config: BroadcastConfig) {
    this.browserId = config.browserId;
    this.serverUrl = config.serverUrl;
    this.iceServers = config.iceServers;
  }

  /**
   * Initialize broadcast
   */
  async initialize(): Promise<void> {
    // Connect to Socket.IO
    // @ts-ignore - Socket.IO client
    this.socket = io(`${this.serverUrl}/browser`, {
      query: { browserId: this.browserId },
    });

    // Wait for socket connection
    await new Promise<void>((resolve, reject) => {
      this.socket.on('connect', () => {
        console.log('[Broadcast] Connected to server');
        resolve();
      });
      this.socket.on('connect_error', reject);
      setTimeout(() => reject(new Error('Connection timeout')), 10000);
    });

    // Start screen capture
    await this.startScreenCapture();

    // Setup WebRTC
    await this.setupWebRTC();
  }

  /**
   * Start screen capture
   */
  private async startScreenCapture(): Promise<void> {
    try {
      // Request screen capture
      this.localStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      } as DisplayMediaStreamConstraints);

      console.log('[Broadcast] Screen capture started');

      // Handle stream end
      this.localStream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('[Broadcast] Screen capture ended');
        this.cleanup();
      });
    } catch (error) {
      console.error('[Broadcast] Failed to start screen capture:', error);
      throw error;
    }
  }

  /**
   * Setup WebRTC peer connection
   */
  private async setupWebRTC(): Promise<void> {
    // Create peer connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    // Add local stream tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => {
        if (this.peerConnection) {
          this.peerConnection.addTrack(track, this.localStream!);
        }
      });
    }

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event: any) => {
      if (event.candidate && this.socket) {
        // Will be set when viewer connects
        // @ts-ignore - browser context
        const viewerId = window.viewerId;
        if (viewerId) {
          this.socket.emit('webrtc:candidate', {
            viewerId,
            candidate: event.candidate.toJSON(),
          });
        }
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        console.log('[Broadcast] Connection state:', this.peerConnection.connectionState);
      }
    };

    // Listen for viewer connection requests
    this.socket.on('webrtc:start', async (data: { viewerId: string }) => {
      // @ts-ignore - browser context
      window.viewerId = data.viewerId;
      await this.createOffer(data.viewerId);
    });

    // Listen for answer
    this.socket.on('webrtc:answer', async (data: { answer: unknown }) => {
      if (this.peerConnection) {
        // @ts-ignore - browser context
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      }
    });

    // Listen for ICE candidates from viewer
    this.socket.on('webrtc:candidate', async (data: { candidate: unknown }) => {
      if (this.peerConnection) {
        // @ts-ignore - browser context
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
    });
  }

  /**
   * Create WebRTC offer
   */
  private async createOffer(viewerId: string): Promise<void> {
    if (!this.peerConnection) {
      return;
    }

    try {
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      this.socket.emit('webrtc:offer', {
        viewerId,
        offer: offer.toJSON(),
      });

      console.log('[Broadcast] Offer created and sent to viewer', viewerId);
    } catch (error) {
      console.error('[Broadcast] Error creating offer:', error);
    }
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track: any) => track.stop());
      this.localStream = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }
}

// Initialize when page loads
(async () => {
  try {
    // Get browser ID from URL
    // @ts-ignore - browser context
    const urlParams = new URLSearchParams(window.location.search);
    const browserId = urlParams.get('id');

    if (!browserId) {
      console.error('[Broadcast] No browser ID provided');
      return;
    }

    // Get server URL (same origin)
    // @ts-ignore - browser context
    const serverUrl = window.location.origin;

    // Get ICE servers from server (will be injected by server)
    // @ts-ignore - browser context
    const iceServers = window.ICE_SERVERS || [
      { urls: 'stun:stun.l.google.com:19302' },
    ];

    const manager = new BroadcastManager({
      browserId,
      serverUrl,
      iceServers,
    });

    await manager.initialize();
    console.log('[Broadcast] Initialized successfully');
  } catch (error) {
    console.error('[Broadcast] Initialization failed:', error);
  }
})();

