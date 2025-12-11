// WebRTC stream receiver for victim client
// Receives JPEG frames via WebRTC data channel and displays them

export class StreamReceiver {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private videoElement: HTMLVideoElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private frameQueue: Uint8Array[] = [];
  private isProcessing: boolean = false;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
    
    // Create canvas for frame rendering
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1920;
    this.canvas.height = 1080;
    this.ctx = this.canvas.getContext('2d')!;
    
    // Set canvas as video source
    const stream = this.canvas.captureStream(30); // 30 FPS
    this.videoElement.srcObject = stream;
  }

  /**
   * Initialize WebRTC connection
   */
  async initialize(iceServers: RTCIceServer[]): Promise<void> {
    this.peerConnection = new RTCPeerConnection({ iceServers });

    // Create data channel for receiving frames
    this.dataChannel = this.peerConnection.createDataChannel('frames', {
      ordered: true,
    });

    this.dataChannel.onmessage = (event) => {
      this.handleFrame(event.data);
    };

    this.dataChannel.onopen = () => {
      console.log('[StreamReceiver] Data channel opened');
    };

    this.dataChannel.onerror = (error) => {
      console.error('[StreamReceiver] Data channel error:', error);
    };

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        // ICE candidates will be handled by the main client
        console.log('[StreamReceiver] ICE candidate generated');
      }
    };

    // Handle connection state
    this.peerConnection.onconnectionstatechange = () => {
      console.log('[StreamReceiver] Connection state:', this.peerConnection?.connectionState);
    };
  }

  /**
   * Handle incoming frame data
   */
  private handleFrame(data: ArrayBuffer | Blob): void {
    // Add to queue
    if (data instanceof ArrayBuffer) {
      this.frameQueue.push(new Uint8Array(data));
    } else {
      data.arrayBuffer().then((buffer) => {
        this.frameQueue.push(new Uint8Array(buffer));
        this.processQueue();
      });
      return;
    }

    // Process queue if not already processing
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Process frame queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.frameQueue.length === 0) {
      return;
    }

    this.isProcessing = true;

    while (this.frameQueue.length > 0) {
      const frameData = this.frameQueue.shift()!;
      
      try {
        // Convert to blob and create image
        const blob = new Blob([frameData], { type: 'image/jpeg' });
        const imageUrl = URL.createObjectURL(blob);
        
        const img = new Image();
        img.onload = () => {
          // Draw frame to canvas
          this.ctx.drawImage(img, 0, 0, this.canvas.width, this.canvas.height);
          URL.revokeObjectURL(imageUrl);
        };
        img.onerror = () => {
          URL.revokeObjectURL(imageUrl);
        };
        img.src = imageUrl;
      } catch (error) {
        console.error('[StreamReceiver] Error processing frame:', error);
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get peer connection for signaling
   */
  getPeerConnection(): RTCPeerConnection {
    if (!this.peerConnection) {
      throw new Error('Peer connection not initialized');
    }
    return this.peerConnection;
  }

  /**
   * Cleanup
   */
  cleanup(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.frameQueue = [];
    this.isProcessing = false;
  }
}

