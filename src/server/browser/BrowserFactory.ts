import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import type { Page } from 'puppeteer';
import type { BrowserInstance } from '../../shared/types/browser.js';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';
import { XvfbManager } from './XvfbManager.js';
import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import { join } from 'path';

// Configure stealth plugin
puppeteer.use(StealthPlugin());

export interface BrowserCreationOptions {
  targetUrl: string;
  xvfbDisplay?: string;
  userDataDir?: string;
}

export class BrowserFactory {
  public readonly xvfbManager: XvfbManager;

  constructor(xvfbManager: XvfbManager) {
    this.xvfbManager = xvfbManager;
  }

  /**
   * Create a new browser instance
   */
  async createBrowser(options: BrowserCreationOptions): Promise<BrowserInstance> {
    const browserId = randomUUID();
    const userDataDir = options.userDataDir || join(config.browser.userDataBasePath, browserId);

    // Ensure user data directory exists
    await mkdir(userDataDir, { recursive: true });

    // Build Puppeteer launch arguments
    const args = this.buildPuppeteerArgs(options.xvfbDisplay);

    logger.info(`Creating browser instance ${browserId}`, {
      browserId,
      targetUrl: options.targetUrl,
      xvfbDisplay: options.xvfbDisplay,
    });

    try {
      // Launch browser
      const puppeteerBrowser = await puppeteer.launch({
        headless: true,
        args,
        userDataDir,
        ignoreHTTPSErrors: true,
        defaultViewport: {
          width: 1920,
          height: 1080,
        },
      });

      // Create target page
      const targetPage = await puppeteerBrowser.newPage();
      await targetPage.setUserAgent(config.browser.defaultUserAgent);

      // Navigate to target URL
      await targetPage.goto(options.targetUrl, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      const browserInstance: BrowserInstance = {
        id: browserId,
        puppeteerBrowser,
        targetPage,
        broadcastPage: null,
        socketId: null,
        status: 'idle',
        createdAt: new Date(),
        lastUsed: new Date(),
        targetUrl: options.targetUrl,
        xvfbDisplay: options.xvfbDisplay,
      };

      // Setup browser crash handling
      this.setupCrashHandling(browserInstance);

      logger.info(`Browser instance ${browserId} created successfully`);

      return browserInstance;
    } catch (error) {
      logger.error(`Failed to create browser instance ${browserId}:`, error);
      throw error;
    }
  }

  /**
   * Build Puppeteer launch arguments
   */
  private buildPuppeteerArgs(xvfbDisplay?: string): string[] {
    const args = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--window-size=1920,1080',
      '--start-maximized',
      '--ignore-certificate-errors',
      '--ignore-certificate-errors-spki-list',
      '--ignore-ssl-errors',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor',
      '--disable-infobars',
      '--disable-notifications',
      '--disable-popup-blocking',
      '--lang=en-US,en',
    ];

    // Add Xvfb display if provided
    if (xvfbDisplay) {
      args.push(`--display=${xvfbDisplay}`);
    }

    // Add proxy if configured
    if (config.browser.proxy) {
      args.push(`--proxy-server=${config.browser.proxy}`);
    }

    return args;
  }

  /**
   * Setup crash handling for browser instance
   */
  private setupCrashHandling(browserInstance: BrowserInstance): void {
    browserInstance.puppeteerBrowser.on('disconnected', () => {
      logger.error(`Browser ${browserInstance.id} disconnected unexpectedly`);
      browserInstance.status = 'error';
    });

    browserInstance.targetPage.on('error', (error) => {
      logger.error(`Page error in browser ${browserInstance.id}:`, error);
    });

    browserInstance.targetPage.on('pageerror', (error) => {
      logger.error(`Page JavaScript error in browser ${browserInstance.id}:`, error);
    });
  }

  /**
   * Create a broadcast page for WebRTC streaming
   */
  async createBroadcastPage(browserInstance: BrowserInstance, broadcastUrl: string): Promise<Page> {
    if (browserInstance.broadcastPage) {
      return browserInstance.broadcastPage;
    }

    const broadcastPage = await browserInstance.puppeteerBrowser.newPage();
    await broadcastPage.goto(broadcastUrl, {
      waitUntil: 'networkidle2',
      timeout: 30000,
    });

    browserInstance.broadcastPage = broadcastPage;
    logger.info(`Broadcast page created for browser ${browserInstance.id}`);

    return broadcastPage;
  }
}

