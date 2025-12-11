import type { Page } from 'puppeteer';
import { logger } from '../utils/logger.js';

export interface FrameCaptureOptions {
  width?: number;
  height?: number;
  quality?: number; // 0-100
  format?: 'jpeg' | 'png';
}

export class FrameCaptureService {
  private captureIntervals: Map<string, NodeJS.Timeout> = new Map();
  private frameRate: number = 30; // FPS

  /**
   * Start capturing frames from a page
   */
  async startCapture(
    pageId: string,
    page: Page,
    onFrame: (frame: Buffer) => void,
    options: FrameCaptureOptions = {}
  ): Promise<void> {
    // Stop any existing capture for this page
    this.stopCapture(pageId);

    const { quality = 80, format = 'jpeg' } = options;
    const interval = 1000 / this.frameRate; // ms between frames

    logger.info(`Starting frame capture for page ${pageId} at ${this.frameRate} FPS`);

    const captureFrame = async () => {
      try {
        // Capture screenshot (viewport only, no clip needed)
        const screenshot = await page.screenshot({
          type: format,
          quality: format === 'jpeg' ? quality : undefined,
          fullPage: false, // Just capture viewport
        });

        if (screenshot) {
          onFrame(screenshot as Buffer);
        }
      } catch (error) {
        logger.error(`Error capturing frame for page ${pageId}:`, error);
        // Don't stop capture on single frame error, just log it
      }
    };

    // Capture first frame immediately
    await captureFrame();

    // Set up interval for continuous capture
    const intervalId = setInterval(captureFrame, interval);
    this.captureIntervals.set(pageId, intervalId);
  }

  /**
   * Stop capturing frames from a page
   */
  stopCapture(pageId: string): void {
    const intervalId = this.captureIntervals.get(pageId);
    if (intervalId) {
      clearInterval(intervalId);
      this.captureIntervals.delete(pageId);
      logger.info(`Stopped frame capture for page ${pageId}`);
    }
  }

  /**
   * Set frame rate for capture
   */
  setFrameRate(fps: number): void {
    this.frameRate = Math.max(1, Math.min(60, fps)); // Clamp between 1-60 FPS
    logger.info(`Frame rate set to ${this.frameRate} FPS`);
  }

  /**
   * Stop all captures
   */
  stopAll(): void {
    for (const [pageId, intervalId] of this.captureIntervals.entries()) {
      clearInterval(intervalId);
      logger.info(`Stopped frame capture for page ${pageId}`);
    }
    this.captureIntervals.clear();
  }
}

