import type { BrowserInstance, MousePayload, MouseClickPayload, MouseScrollPayload, KeyPayload, PastePayload } from './types.js';

// ─── Key name normalization ───────────────────────────────────────────────────

/**
 * Maps browser KeyboardEvent.key values to Playwright key names where they differ.
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

function normalizeKey(key: string): string {
  return KEY_NAME_MAP[key] ?? key;
}

// ─── Coordinate scaling ────────────────────────────────────────────────────────

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

// ─── Input handlers ────────────────────────────────────────────────────────────

export async function handleMouseMove(
  instance: BrowserInstance,
  data: MousePayload,
): Promise<void> {
  try {
    const { x, y } = scaleCoords(instance, data.x, data.y);
    await instance.page.mouse.move(x, y);
  } catch {
    // Page may have closed between event arrival and handler execution
  }
}

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
    // ignore
  }
}

export async function handleMouseScroll(
  instance: BrowserInstance,
  data: MouseScrollPayload,
): Promise<void> {
  try {
    const { x, y } = scaleCoords(instance, data.x, data.y);
    await instance.page.mouse.wheel(data.deltaX, data.deltaY);
    // Keep mouse positioned at scroll point
    await instance.page.mouse.move(x, y);
  } catch {
    // ignore
  }
}

export async function handleKeyDown(
  instance: BrowserInstance,
  data: KeyPayload,
): Promise<void> {
  try {
    await instance.page.keyboard.down(normalizeKey(data.key));
  } catch {
    // ignore
  }
}

export async function handleKeyUp(
  instance: BrowserInstance,
  data: KeyPayload,
): Promise<void> {
  try {
    await instance.page.keyboard.up(normalizeKey(data.key));
  } catch {
    // ignore
  }
}

export async function handlePaste(
  instance: BrowserInstance,
  data: PastePayload,
): Promise<void> {
  try {
    // Brief pause so any preceding mouse_click has time to focus the target field
    await new Promise((r) => setTimeout(r, 150));
    await instance.page.keyboard.type(data.text, { delay: 20 });
  } catch {
    // ignore
  }
}
