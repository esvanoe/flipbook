import { spawn, ChildProcess } from 'child_process';
import { randomInt } from 'crypto';
import { logger } from '../utils/logger.js';

export interface XvfbInstance {
  display: string;
  process: ChildProcess;
  width: number;
  height: number;
  depth: number;
}

export class XvfbManager {
  private activeDisplays: Map<string, XvfbInstance> = new Map();
  private readonly defaultWidth = 1920;
  private readonly defaultHeight = 1080;
  private readonly defaultDepth = 24;

  /**
   * Start a new Xvfb instance
   */
  async start(displayNumber?: number): Promise<XvfbInstance> {
    // Generate display number if not provided
    const display = displayNumber ?? this.generateDisplayNumber();
    const displayStr = `:${display}`;

    // Check if display is already in use
    if (this.activeDisplays.has(displayStr)) {
      throw new Error(`Display ${displayStr} is already in use`);
    }

    const width = this.defaultWidth;
    const height = this.defaultHeight;
    const depth = this.defaultDepth;

    // Start Xvfb process
    const xvfb = spawn('Xvfb', [displayStr, '-screen', '0', `${width}x${height}x${depth}`, '-ac'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Handle Xvfb output
    xvfb.stdout?.on('data', (data) => {
      logger.debug(`Xvfb ${displayStr} stdout: ${data.toString()}`);
    });

    xvfb.stderr?.on('data', (data) => {
      logger.debug(`Xvfb ${displayStr} stderr: ${data.toString()}`);
    });

    // Handle process errors
    xvfb.on('error', (error) => {
      logger.error(`Xvfb ${displayStr} error:`, error);
      this.activeDisplays.delete(displayStr);
    });

    // Wait a moment to ensure Xvfb started successfully
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (xvfb.killed || xvfb.exitCode !== null) {
          reject(new Error(`Xvfb ${displayStr} failed to start`));
        } else {
          resolve();
        }
      }, 1000);

      xvfb.once('spawn', () => {
        clearTimeout(timeout);
        resolve();
      });
    });

    const instance: XvfbInstance = {
      display: displayStr,
      process: xvfb,
      width,
      height,
      depth,
    };

    this.activeDisplays.set(displayStr, instance);
    logger.info(`Xvfb started on display ${displayStr} (${width}x${height}x${depth})`);

    return instance;
  }

  /**
   * Stop an Xvfb instance
   */
  async stop(display: string): Promise<void> {
    const instance = this.activeDisplays.get(display);
    if (!instance) {
      logger.warn(`Xvfb instance ${display} not found`);
      return;
    }

    try {
      // Kill the process
      instance.process.kill('SIGTERM');

      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (instance.process.killed || instance.process.exitCode !== null) {
          resolve();
        } else {
          instance.process.once('exit', () => resolve());
          // Force kill after timeout
          setTimeout(() => {
            if (!instance.process.killed) {
              instance.process.kill('SIGKILL');
            }
            resolve();
          }, 2000);
        }
      });

      this.activeDisplays.delete(display);
      logger.info(`Xvfb stopped on display ${display}`);
    } catch (error) {
      logger.error(`Error stopping Xvfb ${display}:`, error);
      this.activeDisplays.delete(display);
    }
  }

  /**
   * Get an active Xvfb instance
   */
  getInstance(display: string): XvfbInstance | undefined {
    return this.activeDisplays.get(display);
  }

  /**
   * Get all active displays
   */
  getActiveDisplays(): string[] {
    return Array.from(this.activeDisplays.keys());
  }

  /**
   * Cleanup all Xvfb instances
   */
  async cleanupAll(): Promise<void> {
    const displays = Array.from(this.activeDisplays.keys());
    logger.info(`Cleaning up ${displays.length} Xvfb instances`);

    await Promise.all(displays.map((display) => this.stop(display)));
  }

  /**
   * Generate a random display number (avoiding common ones)
   */
  private generateDisplayNumber(): number {
    // Use display numbers 100-199 to avoid conflicts
    let display: number;
    let attempts = 0;
    do {
      display = randomInt(100, 200);
      attempts++;
      if (attempts > 50) {
        throw new Error('Failed to find available display number');
      }
    } while (this.activeDisplays.has(`:${display}`));

    return display;
  }
}

