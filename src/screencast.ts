import type { CDPSession, Frame } from 'playwright';
import type { BrowserInstance } from './types.js';
import { recordFrame } from './metrics.js';

export const SCREENCAST_MAX_WIDTH = 3840;
export const SCREENCAST_MAX_HEIGHT = 2160;
export const SCREENCAST_QUALITY = 90; // JPEG quality 0-100
export const SCREENCAST_FPS = 30;
export const THUMBNAIL_EVERY_N_FRAMES = 5;

export interface ScreencastController {
  stop: () => Promise<void>;
}

/**
 * Starts a CDP Page.startScreencast loop for the given browser instance.
 *
 * Critical behaviour:
 * - Must call `Page.screencastFrameAck` for every frame or Chromium stops
 *   sending after ~3 seconds.
 * - Does NOT await the `onFrame` callback — Socket.IO emit is synchronous.
 * - Restarts on every main-frame navigation via `page.on('framenavigated')`.
 * - Every THUMBNAIL_EVERY_N_FRAMES frames, calls onThumbnail with the frame.
 */
export async function startScreencast(
  instance: BrowserInstance,
  onThumbnail: (browserId: string, buf: Buffer) => void,
): Promise<ScreencastController> {
  let active = true;
  let frameCounter = 0;
  let currentSession: CDPSession | null = null;

  async function startSession(): Promise<void> {
    if (!active) return;

    // Get fresh CDP session each time (navigation detaches old sessions)
    try {
      const session = await instance.page.context().newCDPSession(instance.page);
      currentSession = session;
      instance.cdpSession = session;

      session.on('Page.screencastFrame', (event: ScreencastFrameEvent) => {
        const { data, sessionId, metadata } = event;
        void metadata; // metadata has timestamp/deviceScaleFactor etc — unused for now

        // Ack immediately — Chromium stops after ~3 frames without ack
        session.send('Page.screencastFrameAck', { sessionId }).catch(() => {
          // CDP session may have detached — ignore
        });

        if (!active) return;

        // Convert base64 to Buffer
        const buf = Buffer.from(data, 'base64');

        // Record frame for metrics
        recordFrame(instance.id);

        // Dispatch frame via mutable callback (swapped during admin takeover)
        instance.onFrame(buf);

        // Emit thumbnail to admin every Nth frame
        frameCounter++;
        if (frameCounter % THUMBNAIL_EVERY_N_FRAMES === 0) {
          onThumbnail(instance.id, buf);
        }
      });

      await session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: SCREENCAST_QUALITY,
        maxWidth: SCREENCAST_MAX_WIDTH,
        maxHeight: SCREENCAST_MAX_HEIGHT,
        everyNthFrame: 1,
      });
    } catch (err) {
      // Context may have been destroyed; this is non-fatal
      console.error(`[screencast] Failed to start session: ${(err as Error).message}`);
    }
  }

  async function stopCurrentSession(): Promise<void> {
    if (!currentSession) return;
    try {
      await currentSession.send('Page.stopScreencast');
    } catch {
      // Ignore — session may already be detached
    }
    try {
      await currentSession.detach();
    } catch {
      // Ignore
    }
    currentSession = null;
    instance.cdpSession = null;
  }

  // Handle navigation: restart screencast when main frame navigates
  instance.page.on('framenavigated', (frame: Frame) => {
    // Only restart for main frame (not iframes)
    if (frame.parentFrame() !== null) return;
    if (!active) return;

    void stopCurrentSession().then(() => {
      void startSession();
    });
  });

  // Start initial screencast
  await startSession();

  return {
    async stop() {
      active = false;
      await stopCurrentSession();
    },
  };
}

// ─── CDP type stubs (not exported by playwright types) ───────────────────────

interface ScreencastFrameEvent {
  data: string; // base64 JPEG
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
  sessionId: number;
}
