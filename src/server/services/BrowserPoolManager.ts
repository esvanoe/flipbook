import type { BrowserInstance } from '../../shared/types/browser.js';
import { BrowserFactory, type BrowserCreationOptions } from '../browser/BrowserFactory.js';
import { XvfbManager } from '../browser/XvfbManager.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

export class BrowserPoolManager {
  private browsers: Map<string, BrowserInstance> = new Map();
  private idleBrowsers: BrowserInstance[] = [];
  private browserFactory: BrowserFactory;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(xvfbManager: XvfbManager) {
    this.browserFactory = new BrowserFactory(xvfbManager);
    this.startCleanupTask();
  }

  /**
   * Initialize the browser pool with minimum pool size
   */
  async initialize(): Promise<void> {
    logger.info(`Initializing browser pool with min size ${config.browser.minPoolSize}`);

    // Pre-warm the pool with browsers ready to stream
    const defaultTargetUrl = config.browser.defaultTargetUrl;
    logger.info(`Pre-warming browser pool with target: ${defaultTargetUrl}`);

    for (let i = 0; i < config.browser.minPoolSize; i++) {
      try {
        const browser = await this.createBrowser(defaultTargetUrl);
        this.idleBrowsers.push(browser);
        logger.info(`Pre-warmed browser ${browser.id} (${i + 1}/${config.browser.minPoolSize})`);
      } catch (error) {
        logger.error(`Failed to pre-warm browser ${i + 1}:`, error);
        // Continue with other browsers even if one fails
      }
    }

    logger.info(`Browser pool initialized with ${this.idleBrowsers.length} pre-warmed browsers`);
  }

  /**
   * Get an available browser or create a new one
   */
  async getOrCreateBrowser(targetUrl: string): Promise<BrowserInstance> {
    // Check if we're at max capacity
    if (this.browsers.size >= config.browser.maxInstances) {
      throw new Error(
        `Maximum browser instances (${config.browser.maxInstances}) reached. Cannot create new browser.`
      );
    }

    // Try to reuse an idle browser
    if (this.idleBrowsers.length > 0) {
      const browser = this.idleBrowsers.shift()!;
      logger.info(`Reusing idle browser ${browser.id}`);

      // Navigate to new target URL
      try {
        await browser.targetPage.goto(targetUrl, {
          waitUntil: 'networkidle2',
          timeout: 30000,
        });
        browser.targetUrl = targetUrl;
        browser.status = 'idle';
        browser.lastUsed = new Date();
        return browser;
      } catch (error) {
        logger.error(`Failed to navigate idle browser ${browser.id} to ${targetUrl}:`, error);
        // If navigation fails, cleanup and create new browser
        await this.cleanupBrowser(browser.id);
      }
    }

    // Create new browser
    return await this.createBrowser(targetUrl);
  }

  /**
   * Create a new browser instance
   */
  async createBrowser(targetUrl: string): Promise<BrowserInstance> {
    // Start Xvfb for this browser
    const xvfb = await this.browserFactory.xvfbManager.start();
    const xvfbDisplay = xvfb.display;

    const options: BrowserCreationOptions = {
      targetUrl,
      xvfbDisplay,
    };

    const browser = await this.browserFactory.createBrowser(options);
    this.browsers.set(browser.id, browser);

    logger.info(`Browser ${browser.id} created and added to pool`);

    return browser;
  }

  /**
   * Get a browser by ID
   */
  getBrowser(browserId: string): BrowserInstance | undefined {
    return this.browsers.get(browserId);
  }

  /**
   * Reserve a browser for a session
   */
  async reserveBrowser(browserId: string, sessionId: string): Promise<void> {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser ${browserId} not found`);
    }

    // Remove from idle pool if present
    const idleIndex = this.idleBrowsers.findIndex((b) => b.id === browserId);
    if (idleIndex >= 0) {
      this.idleBrowsers.splice(idleIndex, 1);
    }

    browser.status = 'paired';
    browser.lastUsed = new Date();
    logger.info(`Browser ${browserId} reserved for session ${sessionId}`);
  }

  /**
   * Release a browser back to the pool
   */
  async releaseBrowser(browserId: string): Promise<void> {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      return;
    }

    browser.status = 'idle';
    browser.lastUsed = new Date();

    // Add to idle pool
    if (!this.idleBrowsers.includes(browser)) {
      this.idleBrowsers.push(browser);
    }

    logger.info(`Browser ${browserId} released back to pool`);
  }

  /**
   * Cleanup a browser instance
   */
  async cleanupBrowser(browserId: string): Promise<void> {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      return;
    }

    logger.info(`Cleaning up browser ${browserId}`);

    try {
      // Close browser
      await browser.puppeteerBrowser.close();

      // Stop Xvfb if it exists
      if (browser.xvfbDisplay) {
        await this.browserFactory['xvfbManager'].stop(browser.xvfbDisplay);
      }

      // Remove from maps
      this.browsers.delete(browserId);
      const idleIndex = this.idleBrowsers.findIndex((b) => b.id === browserId);
      if (idleIndex >= 0) {
        this.idleBrowsers.splice(idleIndex, 1);
      }

      logger.info(`Browser ${browserId} cleaned up successfully`);
    } catch (error) {
      logger.error(`Error cleaning up browser ${browserId}:`, error);
      // Still remove from maps even if cleanup failed
      this.browsers.delete(browserId);
    }
  }

  /**
   * Cleanup all idle browsers older than timeout
   */
  async cleanupIdleBrowsers(): Promise<number> {
    const now = Date.now();
    const maxIdleTime = config.browser.idleTimeout;
    let cleaned = 0;

    const browsersToCleanup: string[] = [];

    for (const browser of this.idleBrowsers) {
      const idleTime = now - browser.lastUsed.getTime();
      if (idleTime > maxIdleTime) {
        browsersToCleanup.push(browser.id);
      }
    }

    for (const browserId of browsersToCleanup) {
      await this.cleanupBrowser(browserId);
      cleaned++;
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} idle browsers`);
    }

    return cleaned;
  }

  /**
   * Cleanup all browsers
   */
  async cleanupAll(): Promise<void> {
    logger.info(`Cleaning up all ${this.browsers.size} browsers`);

    const browserIds = Array.from(this.browsers.keys());
    await Promise.all(browserIds.map((id) => this.cleanupBrowser(id)));

    logger.info('All browsers cleaned up');
  }

  /**
   * Start periodic cleanup task
   */
  private startCleanupTask(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleBrowsers().catch((error) => {
        logger.error('Error in cleanup task:', error);
      });
    }, 5 * 60 * 1000);
  }

  /**
   * Stop cleanup task
   */
  stopCleanupTask(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Get active browser count
   */
  getActiveCount(): number {
    return this.browsers.size;
  }

  /**
   * Get idle browser count
   */
  getIdleCount(): number {
    return this.idleBrowsers.length;
  }

  /**
   * Get all browsers
   */
  getAllBrowsers(): BrowserInstance[] {
    return Array.from(this.browsers.values());
  }
}

