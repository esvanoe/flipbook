import type { Browser, Page } from 'puppeteer';

export interface BrowserInstance {
  id: string;
  puppeteerBrowser: Browser;
  targetPage: Page;
  broadcastPage: Page | null;
  socketId: string | null;
  status: 'idle' | 'paired' | 'admin-controlled' | 'error';
  createdAt: Date;
  lastUsed: Date;
  targetUrl: string;
  xvfbDisplay?: string;
}

export type BrowserStatus = BrowserInstance['status'];

