#!/bin/bash
# setup-turn-tls.sh
# Optional: Sets up TLS/DTLS support for TURN server
# Requires a domain name with DNS pointing to this server

set -e

echo "=== Setting up TLS/DTLS for TURN Server ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root or with sudo"
    exit 1
fi

# Check if certbot is installed
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot..."
    apt-get update
    apt-get install -y certbot
fi

# Get domain name
read -p "Enter your domain name for TURN server (e.g., turn.example.com): " DOMAIN

if [ -z "$DOMAIN" ]; then
    echo "✗ Domain name is required"
    exit 1
fi

# Verify DNS resolution
echo "Verifying DNS resolution..."
DOMAIN_IP=$(dig +short ${DOMAIN} | tail -n1)
SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || curl -s icanhazip.com)

if [ "$DOMAIN_IP" != "$SERVER_IP" ]; then
    echo "⚠️  Warning: Domain ${DOMAIN} resolves to ${DOMAIN_IP}"
    echo "   Server IP is ${SERVER_IP}"
    read -p "Continue anyway? (y/N): " CONTINUE
    if [ "$CONTINUE" != "y" ] && [ "$CONTINUE" != "Y" ]; then
        exit 1
    fi
fi

# Get certificate
echo "Obtaining SSL certificate..."
certbot certonly --standalone -d ${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email

# Check if certificate was obtained
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    echo "✗ Failed to obtain certificate"
    exit 1
fi

echo "✓ Certificate obtained"

# Backup current config
cp /etc/turnserver.conf /etc/turnserver.conf.backup.$(date +%Y%m%d_%H%M%S)

# Update turnserver.conf to add TLS
echo "Updating Coturn configuration..."

# Check if TLS config already exists
if grep -q "tls-listening-port" /etc/turnserver.conf; then
    echo "⚠️  TLS configuration already exists in /etc/turnserver.conf"
    read -p "Overwrite? (y/N): " OVERWRITE
    if [ "$OVERWRITE" != "y" ] && [ "$OVERWRITE" != "Y" ]; then
        echo "Aborted. Manual configuration required."
        exit 0
    fi
fi

# Append TLS configuration
cat >> /etc/turnserver.conf <<TLS

# TLS/DTLS Configuration (added by setup-turn-tls.sh)
cert=/etc/letsencrypt/live/${DOMAIN}/fullchain.pem
pkey=/etc/letsencrypt/live/${DOMAIN}/privkey.pem
tls-listening-port=5349
dtls-listening-port=5349

# Enable TLS/DTLS
TLS
TLS

# Update iptables to allow TLS ports
echo "Updating firewall rules..."
iptables -A INPUT -p tcp --dport 5349 -j ACCEPT
iptables -A INPUT -p udp --dport 5349 -j ACCEPT
iptables-save > /etc/iptables/rules.v4

# Restart Coturn
echo "Restarting Coturn..."
systemctl restart coturn

# Wait for service to start
sleep 3

# Check status
if systemctl is-active --quiet coturn; then
    echo "✓ Coturn is running with TLS/DTLS support"
else
    echo "✗ Coturn failed to start. Check logs: journalctl -u coturn -n 50"
    exit 1
fi

echo ""
echo "=== TLS/DTLS Setup Complete ==="
echo ""
echo "TLS URLs:"
echo "  turns:${DOMAIN}:5349 (TLS)"
echo "  turn:${DOMAIN}:5349?transport=udp (DTLS)"
echo ""
echo "Update your main server configuration to use these URLs for encrypted connections."
echo ""
echo "Note: Certificates expire in 90 days. Set up auto-renewal:"
echo "  certbot renew --dry-run"
