import type { BrowserInstance } from '../../shared/types/browser.js';
import { FrameCaptureService } from './FrameCaptureService.js';
import { logger } from '../utils/logger.js';

export class WebRTCStreamingService {
  private frameCapture: FrameCaptureService;
  private activeStreams: Map<string, { browserId: string; viewerId: string }> = new Map();

  constructor() {
    this.frameCapture = new FrameCaptureService();
  }

  /**
   * Start streaming a browser instance to a viewer
   */
  async startStreaming(
    browser: BrowserInstance,
    viewerId: string,
    onFrame: (frame: Buffer) => void
  ): Promise<void> {
    const streamId = `${browser.id}-${viewerId}`;

    if (this.activeStreams.has(streamId)) {
      logger.warn(`Stream ${streamId} already active`);
      return;
    }

    logger.info(`Starting stream from browser ${browser.id} to viewer ${viewerId}`);

    // Get viewport dimensions
    const viewport = await browser.targetPage.viewport();
    const width = viewport?.width || 1920;
    const height = viewport?.height || 1080;

    // Start frame capture
    await this.frameCapture.startCapture(
      streamId,
      browser.targetPage,
      onFrame,
      {
        width,
        height,
        quality: 85,
        format: 'jpeg',
      }
    );

    this.activeStreams.set(streamId, { browserId: browser.id, viewerId });

    logger.info(`Stream ${streamId} started`);
  }

  /**
   * Stop streaming to a viewer
   */
  stopStreaming(browserId: string, viewerId: string): void {
    const streamId = `${browserId}-${viewerId}`;
    
    if (this.activeStreams.has(streamId)) {
      this.frameCapture.stopCapture(streamId);
      this.activeStreams.delete(streamId);
      logger.info(`Stopped stream ${streamId}`);
    }
  }

  /**
   * Stop all streams for a browser
   */
  stopBrowserStreams(browserId: string): void {
    const streamsToStop: string[] = [];
    
    for (const [streamId, stream] of this.activeStreams.entries()) {
      if (stream.browserId === browserId) {
        streamsToStop.push(streamId);
      }
    }

    for (const streamId of streamsToStop) {
      const stream = this.activeStreams.get(streamId);
      if (stream) {
        this.stopStreaming(stream.browserId, stream.viewerId);
      }
    }
  }

  /**
   * Get active stream count for a browser
   */
  getStreamCount(browserId: string): number {
    let count = 0;
    for (const stream of this.activeStreams.values()) {
      if (stream.browserId === browserId) {
        count++;
      }
    }
    return count;
  }
}

