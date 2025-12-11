# Reverse Proxy Setup Guide

This guide explains how to set up a reverse proxy with TLS/SSL certificates for BitM-NG.

## Overview

The BitM-NG application runs on port `58082` internally. To serve it over HTTPS on port 443, you need a reverse proxy that handles:

1. **TLS/SSL termination** - Handles HTTPS encryption
2. **Certificate management** - Obtains and renews Let's Encrypt certificates
3. **WebSocket proxying** - Forwards Socket.IO connections
4. **HTTP to HTTPS redirects** - Redirects all HTTP traffic to HTTPS

## Recommended: Caddy

**Caddy** is recommended because it:
- Automatically obtains and renews Let's Encrypt certificates
- Handles WebSocket upgrades automatically
- Simple configuration
- Built-in security headers

## Option 1: Caddy (Standalone Installation)

### Prerequisites

- Domain name pointing to your server
- Ports 80 and 443 open in firewall
- Root/sudo access

### Setup Steps

1. **Run the setup script:**
```bash
sudo ./scripts/setup-reverse-proxy.sh www.yourdomain.com
```

2. **Open firewall ports (if using UFW):**
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
```

3. **Verify Caddy is running:**
```bash
sudo systemctl status caddy
```

4. **Check logs:**
```bash
sudo tail -f /var/log/caddy/bitm-ng.log
```

### Manual Caddy Installation

If you prefer to install manually:

```bash
# Install Caddy
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy

# Create Caddyfile
sudo nano /etc/caddy/Caddyfile
```

Add this configuration (replace `www.yourdomain.com` with your domain):

```
www.yourdomain.com {
    reverse_proxy localhost:58082
}
```

Start Caddy:
```bash
sudo systemctl enable caddy
sudo systemctl start caddy
```

## Option 2: Nginx with Certbot

### Installation

```bash
sudo apt update
sudo apt install -y nginx certbot python3-certbot-nginx
```

### Nginx Configuration

Create `/etc/nginx/sites-available/bitm-ng`:

```nginx
server {
    listen 80;
    server_name www.yourdomain.com;

    location / {
        proxy_pass http://localhost:58082;
        proxy_http_version 1.1;
        
        # WebSocket support
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/bitm-ng /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### Obtain SSL Certificate

```bash
sudo certbot --nginx -d www.yourdomain.com
```

Certbot will automatically:
- Obtain Let's Encrypt certificate
- Configure Nginx for HTTPS
- Set up automatic renewal

## Option 3: Docker Compose with Caddy

If you're using Docker, use the production compose file:

1. **Edit the Caddyfile:**
```bash
nano docker/caddy/Caddyfile
# Replace www.remote-login.us with your domain
```

2. **Start with production compose:**
```bash
cd docker
docker compose -f docker-compose.prod.yml up -d
```

This will:
- Start Caddy container on ports 80/443
- Automatically obtain Let's Encrypt certificates
- Proxy to the application container

## Verification

After setup, verify:

1. **HTTPS works:**
```bash
curl -I https://www.yourdomain.com
```

2. **HTTP redirects to HTTPS:**
```bash
curl -I http://www.yourdomain.com
# Should return 301 redirect
```

3. **WebSocket connection:**
```bash
# Test from browser console:
# new WebSocket('wss://www.yourdomain.com/socket.io/')
```

## Certificate Renewal

### Caddy
- **Automatic** - Caddy renews certificates automatically
- No action needed

### Certbot (Nginx)
- Certbot sets up automatic renewal via systemd timer
- Verify renewal: `sudo certbot renew --dry-run`

## Troubleshooting

### Certificate Not Obtained

1. **Check DNS:**
```bash
dig www.yourdomain.com
# Should point to your server IP
```

2. **Check firewall:**
```bash
sudo ufw status
# Ports 80 and 443 should be open
```

3. **Check Caddy logs:**
```bash
sudo journalctl -u caddy -f
```

### WebSocket Not Working

1. **Verify proxy headers** - Ensure `Upgrade` and `Connection` headers are forwarded
2. **Check Caddy/Nginx logs** for WebSocket upgrade errors
3. **Test WebSocket directly** on port 58082 to isolate proxy issues

### Port Already in Use

If port 443 is already in use:
```bash
sudo netstat -tlnp | grep :443
# or
sudo ss -tlnp | grep :443
```

Stop the conflicting service or use a different port.

## Security Considerations

1. **Firewall:** Only expose ports 80 and 443 to the internet
2. **Application:** Keep the app on localhost (127.0.0.1) or use firewall rules
3. **Headers:** The Caddyfile includes security headers (X-Frame-Options, etc.)
4. **TLS:** Caddy uses TLS 1.2+ by default

## Files Created

- `/etc/caddy/Caddyfile` - Caddy configuration (standalone)
- `docker/caddy/Caddyfile` - Caddy configuration (Docker)
- `/var/log/caddy/bitm-ng.log` - Caddy access logs

## Next Steps

After setting up the reverse proxy:

1. Update your application's CORS settings if needed
2. Test WebSocket connections through the proxy
3. Monitor logs for any issues
4. Set up monitoring/alerting for certificate expiration (Caddy handles this automatically)

---

**Last Updated:** 2025-12-11

