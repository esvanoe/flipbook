#!/usr/bin/env tsx
/**
 * Interactive tool to add a new target to targets.json.
 * Usage: npm run add-target
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { input, select } from '@inquirer/prompts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TARGETS_PATH = join(__dirname, '..', 'targets.json');

async function loadTargets(): Promise<Record<string, unknown>> {
  if (!existsSync(TARGETS_PATH)) return {};
  const raw = await readFile(TARGETS_PATH, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

async function main(): Promise<void> {
  console.log('\n=== BITM-NG: Add Target ===\n');

  const key = await input({
    message: 'Target key (used in payload URL ?t=<key>):',
    validate: (v) => v.trim().length > 0 || 'Required',
  });

  const name = await input({
    message: 'Display name:',
    default: key,
  });

  const url = await input({
    message: 'Target URL (must be https://):',
    validate: (v) => {
      try { new URL(v); return true; }
      catch { return 'Invalid URL'; }
    },
  });

  const widthStr = await input({
    message: 'Browser viewport width:',
    default: '1920',
    validate: (v) => Number.isInteger(Number(v)) && Number(v) > 0 || 'Must be positive integer',
  });

  const heightStr = await input({
    message: 'Browser viewport height:',
    default: '1080',
    validate: (v) => Number.isInteger(Number(v)) && Number(v) > 0 || 'Must be positive integer',
  });

  const injectJs = await input({
    message: 'Custom JS to inject (optional, leave blank for none):',
    default: '',
  });

  const targets = await loadTargets();

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

  targets[key] = {
    name: name.trim(),
    url: url.trim(),
    width: parseInt(widthStr, 10),
    height: parseInt(heightStr, 10),
    ...(injectJs.trim() ? { inject_js: injectJs.trim() } : {}),
  };

  await writeFile(TARGETS_PATH, JSON.stringify(targets, null, 2), 'utf-8');
  console.log(`\nTarget "${key}" saved to targets.json`);
  console.log(`\nPayload URL param: ?t=${key}&k=<socket_key>`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
