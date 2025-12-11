import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BrowserPoolManager } from '../../../src/server/services/BrowserPoolManager.js';
import { XvfbManager } from '../../../src/server/browser/XvfbManager.js';
// Mock XvfbManager
vi.mock('../../../src/server/browser/XvfbManager.js', () => {
    return {
        XvfbManager: vi.fn().mockImplementation(() => ({
            start: vi.fn().mockResolvedValue({
                display: ':100',
                process: { kill: vi.fn() },
                width: 1920,
                height: 1080,
                depth: 24,
            }),
            stop: vi.fn().mockResolvedValue(undefined),
            cleanupAll: vi.fn().mockResolvedValue(undefined),
        })),
    };
});
// Mock BrowserFactory
vi.mock('../../../src/server/browser/BrowserFactory.js', () => {
    return {
        BrowserFactory: vi.fn().mockImplementation(() => ({
            createBrowser: vi.fn().mockResolvedValue({
                id: 'browser-123',
                puppeteerBrowser: {
                    close: vi.fn().mockResolvedValue(undefined),
                },
                targetPage: {
                    goto: vi.fn().mockResolvedValue(undefined),
                },
                broadcastPage: null,
                socketId: null,
                status: 'idle',
                createdAt: new Date(),
                lastUsed: new Date(),
                targetUrl: 'https://example.com',
                xvfbDisplay: ':100',
            }),
            xvfbManager: {
                start: vi.fn().mockResolvedValue({
                    display: ':100',
                    process: { kill: vi.fn() },
                }),
                stop: vi.fn().mockResolvedValue(undefined),
            },
        })),
    };
});
describe('BrowserPoolManager', () => {
    let browserPoolManager;
    let xvfbManager;
    beforeEach(() => {
        vi.clearAllMocks();
        xvfbManager = new XvfbManager();
        browserPoolManager = new BrowserPoolManager(xvfbManager);
    });
    describe('initialize', () => {
        it('should initialize successfully', async () => {
            await expect(browserPoolManager.initialize()).resolves.not.toThrow();
        });
    });
    describe('getActiveCount', () => {
        it('should return 0 initially', () => {
            expect(browserPoolManager.getActiveCount()).toBe(0);
        });
    });
    describe('getIdleCount', () => {
        it('should return 0 initially', () => {
            expect(browserPoolManager.getIdleCount()).toBe(0);
        });
    });
    describe('getBrowser', () => {
        it('should return undefined for non-existent browser', () => {
            const browser = browserPoolManager.getBrowser('non-existent');
            expect(browser).toBeUndefined();
        });
    });
    describe('reserveBrowser', () => {
        it('should throw error if browser not found', async () => {
            await expect(browserPoolManager.reserveBrowser('non-existent', 'session-123')).rejects.toThrow('Browser non-existent not found');
        });
    });
    describe('releaseBrowser', () => {
        it('should handle non-existent browser gracefully', async () => {
            await expect(browserPoolManager.releaseBrowser('non-existent')).resolves.not.toThrow();
        });
    });
    describe('cleanupBrowser', () => {
        it('should handle non-existent browser gracefully', async () => {
            await expect(browserPoolManager.cleanupBrowser('non-existent')).resolves.not.toThrow();
        });
    });
    describe('getAllBrowsers', () => {
        it('should return empty array initially', () => {
            const browsers = browserPoolManager.getAllBrowsers();
            expect(browsers).toEqual([]);
        });
    });
});
//# sourceMappingURL=BrowserPoolManager.test.js.map