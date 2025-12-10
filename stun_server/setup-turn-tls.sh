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

# Warn about cloud provider firewall requirements
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "⚠️  IMPORTANT: Cloud Provider Firewall Configuration Required"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "This script requires the following ports to be open in your cloud provider's"
echo "firewall/security group:"
echo ""
echo "  • Port 80 (TCP) - For Let's Encrypt certificate validation"
echo "  • Port 5349 (TCP/UDP) - For TLS/DTLS TURN connections"
echo ""
echo "Common cloud providers:"
echo "  • AWS: Security Group - Add inbound rules:"
echo "      - Port 80 (TCP) from 0.0.0.0/0"
echo "      - Port 5349 (TCP) from 0.0.0.0/0"
echo "      - Port 5349 (UDP) from 0.0.0.0/0"
echo "  • Google Cloud: Firewall Rules - Allow tcp:80, tcp:5349, udp:5349"
echo "  • Azure: Network Security Group - Add inbound rules for ports 80, 5349"
echo "  • DigitalOcean: Cloud Firewall - Add rules for ports 80, 5349"
echo "  • Linode: Firewall - Add rules for ports 80, 5349"
echo ""
echo "The script will configure iptables, but your cloud provider's firewall"
echo "must also allow these ports for Let's Encrypt validation and TLS connections."
echo ""
read -p "Have you configured your cloud provider's firewall to allow ports 80 and 5349? (y/N): " FIREWALL_READY

if [ "$FIREWALL_READY" != "y" ] && [ "$FIREWALL_READY" != "Y" ]; then
    echo ""
    echo "Please configure your cloud provider's firewall first, then run this script again."
    echo ""
    SERVER_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || curl -s icanhazip.com || echo "YOUR_SERVER_IP")
    echo "After configuring, you can verify ports are accessible:"
    echo "  • Port 80: curl -I http://${SERVER_IP}"
    echo "  • Port 5349: nc -zv ${SERVER_IP} 5349"
    echo "  • Or use an online tool: https://www.yougetsignal.com/tools/open-ports/"
    echo ""
    exit 0
fi

echo ""
echo "✓ Proceeding with TLS setup..."
echo ""
echo "Note: If certificate validation fails, verify port 80 is accessible from the internet."
echo ""

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
# Note: --standalone mode requires port 80 to be open for ACME HTTP-01 challenge
echo "Obtaining SSL certificate..."
echo "  Note: This requires port 80 (TCP) to be accessible for Let's Encrypt validation"

# Temporarily open port 80 in firewall for certbot
echo "  Temporarily opening port 80 in firewall..."
iptables -A INPUT -p tcp --dport 80 -j ACCEPT
iptables-save > /etc/iptables/rules.v4

# Run certbot
certbot certonly --standalone -d ${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email

# Note: Port 80 is left open - you can remove the rule later if desired:
# iptables -D INPUT -p tcp --dport 80 -j ACCEPT
# iptables-save > /etc/iptables/rules.v4
#
# Alternative: If you cannot open port 80, use DNS challenge instead:
# certbot certonly --manual --preferred-challenges dns -d ${DOMAIN}

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
echo "Updating iptables firewall rules..."
echo "  Note: This only configures iptables. Ensure your cloud provider's"
echo "        firewall also allows port 5349 (TCP/UDP) for TLS/DTLS connections."
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
