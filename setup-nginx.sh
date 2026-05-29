#!/bin/bash
# Flipbook nginx setup script (FIXED)
# Run as root: sudo bash setup-nginx-fixed.sh

set -e

echo "=== Flipbook nginx Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Prompt for domain
read -p "Enter your domain name (e.g., phish.example.com): " DOMAIN
if [ -z "$DOMAIN" ]; then
    echo "Error: Domain name is required"
    exit 1
fi

# Prompt for email for Let's Encrypt
read -p "Enter email for Let's Encrypt notifications: " EMAIL
if [ -z "$EMAIL" ]; then
    echo "Error: Email is required"
    exit 1
fi

echo ""
echo "Configuration:"
echo "  Domain: $DOMAIN"
echo "  Email: $EMAIL"
echo ""
read -p "Continue? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "[1/7] Installing nginx..."
apt-get update
apt-get install -y nginx

echo ""
echo "[2/7] Installing certbot..."
apt-get install -y certbot python3-certbot-nginx

echo ""
echo "[3/7] Creating temporary HTTP-only nginx config..."
# Create HTTP-only config first (no SSL)
cat > /etc/nginx/sites-available/flipbook << EOF
# Flipbook nginx configuration (temporary HTTP-only for certificate acquisition)
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    
    # Allow ACME challenge for Let's Encrypt
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }
    
    # Temporary: proxy to Flipbook (will redirect to HTTPS after cert is obtained)
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/flipbook /etc/nginx/sites-enabled/flipbook

# Remove default site if it exists
rm -f /etc/nginx/sites-enabled/default

# Test nginx config (should work now - no SSL yet)
nginx -t

echo ""
echo "[4/7] Starting nginx..."
systemctl enable nginx
systemctl restart nginx

echo ""
echo "[5/7] Obtaining SSL certificate..."
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL"

echo ""
echo "[6/7] Creating final nginx config with SSL..."
# Now create the full config with SSL (certbot should have already added SSL, but we'll ensure it's correct)
sed "s/example\.com/$DOMAIN/g" nginx.conf > /etc/nginx/sites-available/flipbook

# Test the new config
nginx -t

echo ""
echo "[7/7] Reloading nginx with SSL..."
systemctl reload nginx

echo ""
echo "=== Setup Complete ==="
echo ""
echo "✓ nginx installed and configured"
echo "✓ SSL certificate obtained for $DOMAIN"
echo "✓ nginx is running and will start on boot"
echo ""
echo "Next steps:"
echo "1. Ensure DNS A record for $DOMAIN points to this server's IP"
echo "2. Start Flipbook: screen -S flipbook npm start"
echo "3. Test: https://$DOMAIN/"
echo ""
echo "Useful commands:"
echo "  sudo systemctl status nginx    # Check nginx status"
echo "  sudo systemctl reload nginx    # Reload config after changes"
echo "  sudo certbot renew --dry-run   # Test cert renewal"
echo "  sudo tail -f /var/log/nginx/flipbook-access.log  # View access logs"
echo ""
