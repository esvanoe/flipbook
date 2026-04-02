#!/usr/bin/env tsx
/**
 * Restore a stolen session into a local browser.
 * Takes cookies (and optionally localStorage) as JSON and injects them
 * into a Playwright browser context, then opens the target URL.
 *
 * Usage:
 *   npm run session-restore -- --cookies cookies.json --url https://example.com
 *   npm run session-restore -- --cookies cookies.json --storage storage.json --url https://example.com
 */

import { readFile } from 'fs/promises';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { input } from '@inquirer/prompts';
import type { SerializedCookie } from '../src/types.js';

chromium.use(StealthPlugin());

interface StoragePayload {
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
}

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

async function main(): Promise<void> {
  console.log('\n=== Flipbook: Session Restore ===\n');

  const args = parseArgs();

  const cookiesFile = args.cookiesFile ?? await input({
    message: 'Path to cookies JSON file:',
    validate: (v) => v.trim().length > 0 || 'Required',
  });

  const targetUrl = args.url ?? await input({
    message: 'Target URL to open:',
    validate: (v) => { try { new URL(v); return true; } catch { return 'Invalid URL'; } },
  });

  const storageFile = args.storageFile ?? await input({
    message: 'Path to storage JSON file (optional, Enter to skip):',
    default: '',
  });

  // Load cookies
  const cookiesRaw = await readFile(cookiesFile.trim(), 'utf-8');
  const cookies: SerializedCookie[] = JSON.parse(cookiesRaw);

  // Load storage if provided
  let storage: StoragePayload = {};
  if (storageFile.trim()) {
    const storageRaw = await readFile(storageFile.trim(), 'utf-8');
    storage = JSON.parse(storageRaw) as StoragePayload;
  }

  console.log(`\nLoaded ${cookies.length} cookies. Launching browser...`);

  const context = await chromium.launchPersistentContext('', {
    headless: false,
    args: [
      '--no-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  // Add cookies to context
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

  // Navigate first so we're on the right origin for localStorage
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  // Inject localStorage
  if (storage.localStorage && Object.keys(storage.localStorage).length > 0) {
    await page.evaluate((data) => {
      Object.entries(data).forEach(([k, v]) => localStorage.setItem(k, v));
    }, storage.localStorage);
    console.log(`Injected ${Object.keys(storage.localStorage).length} localStorage entries.`);
  }

  // Inject sessionStorage
  if (storage.sessionStorage && Object.keys(storage.sessionStorage).length > 0) {
    await page.evaluate((data) => {
      Object.entries(data).forEach(([k, v]) => sessionStorage.setItem(k, v));
    }, storage.sessionStorage);
    console.log(`Injected ${Object.keys(storage.sessionStorage).length} sessionStorage entries.`);
  }

  // Reload to apply cookies and storage
  await page.reload({ waitUntil: 'domcontentloaded' });
  console.log('\nSession restored. Browser is open — close the window when done.');

  // Wait for context to close
  await new Promise<void>((resolve) => {
    context.on('close', resolve);
  });
}

function normalizeSameSite(s: string): 'Strict' | 'Lax' | 'None' | undefined {
  if (s === 'Strict') return 'Strict';
  if (s === 'Lax') return 'Lax';
  if (s === 'None') return 'None';
  return undefined;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
