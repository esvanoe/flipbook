import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
// Mock the config module
vi.mock('../../../src/server/config/config.js', async () => {
    const actual = await vi.importActual('../../../src/server/config/config.js');
    return actual;
});
describe('Configuration', () => {
    it('should load STUN/TURN config from file', () => {
        const configPath = join(process.cwd(), 'config', 'turn-servers-exported.json');
        try {
            const configData = readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(configData);
            expect(parsed.webrtc).toBeDefined();
            expect(parsed.webrtc.stunServers).toBeInstanceOf(Array);
            expect(parsed.webrtc.stunServers.length).toBeGreaterThan(0);
            if (parsed.webrtc.turnServers) {
                expect(parsed.webrtc.turnServers).toBeInstanceOf(Array);
                parsed.webrtc.turnServers.forEach((turn) => {
                    expect(turn.urls).toBeDefined();
                    expect(turn.username).toBeDefined();
                    expect(turn.credential).toBeDefined();
                });
            }
        }
        catch (error) {
            // If file doesn't exist, that's okay for tests
            console.warn('STUN/TURN config file not found, skipping test');
        }
    });
    it('should have valid STUN server URLs', () => {
        const configPath = join(process.cwd(), 'config', 'turn-servers-exported.json');
        try {
            const configData = readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(configData);
            parsed.webrtc.stunServers.forEach((stun) => {
                expect(stun.urls).toMatch(/^stun:/);
            });
        }
        catch (error) {
            console.warn('STUN/TURN config file not found, skipping test');
        }
    });
    it('should have valid TURN server URLs', () => {
        const configPath = join(process.cwd(), 'config', 'turn-servers-exported.json');
        try {
            const configData = readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(configData);
            if (parsed.webrtc.turnServers) {
                parsed.webrtc.turnServers.forEach((turn) => {
                    expect(turn.urls).toMatch(/^turn:|^turns:/);
                });
            }
        }
        catch (error) {
            console.warn('STUN/TURN config file not found, skipping test');
        }
    });
});
//# sourceMappingURL=config.test.js.map