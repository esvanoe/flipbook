#!/bin/bash
# setup-turn-server.sh
# Run as root or with sudo

set -e

echo "=== STUN/TURN Server Setup ==="

# Update system
echo "[1/7] Updating system packages..."
apt-get update
apt-get upgrade -y

# Install dependencies
echo "[2/7] Installing dependencies..."
apt-get install -y \
    coturn \
    iptables-persistent \
    certbot \
    curl \
    net-tools \
    dnsutils

# Configure iptables firewall
echo "[3/7] Configuring iptables firewall..."

# Flush existing rules
iptables -F
iptables -X
iptables -t nat -F
iptables -t nat -X
iptables -t mangle -F
iptables -t mangle -X

# Set default policies
iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT ACCEPT

# Allow loopback
iptables -A INPUT -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT

# Allow established and related connections
iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT

# Allow SSH (be careful - don't lock yourself out!)
iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow STUN/TURN ports
iptables -A INPUT -p tcp --dport 3478 -j ACCEPT
iptables -A INPUT -p udp --dport 3478 -j ACCEPT

# Allow TURN relay port range (UDP)
iptables -A INPUT -p udp --dport 49152:65535 -j ACCEPT

# Allow ICMP (ping)
iptables -A INPUT -p icmp -j ACCEPT

# Save iptables rules
echo "[4/7] Saving iptables rules..."
mkdir -p /etc/iptables
iptables-save > /etc/iptables/rules.v4

# Install iptables-persistent to auto-load rules on boot
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent

# Generate TURN credentials
echo "[5/7] Generating TURN credentials..."
TURN_USERNAME="bitm-ng-turn"
TURN_PASSWORD=$(openssl rand -hex 32)
REALM="bitm-ng.local"

# Save credentials to file
cat > /root/turn-credentials.txt <<EOF
TURN_USERNAME=${TURN_USERNAME}
TURN_PASSWORD=${TURN_PASSWORD}
REALM=${REALM}
EOF

chmod 600 /root/turn-credentials.txt

echo "[6/7] Configuring Coturn..."
# Backup original config
cp /etc/turnserver.conf /etc/turnserver.conf.backup

# Get server's public IP
PUBLIC_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || curl -s icanhazip.com)
PRIVATE_IP=$(hostname -I | awk '{print $1}')

# If public IP detection fails, prompt user
if [ -z "$PUBLIC_IP" ] || [ "$PUBLIC_IP" == "" ]; then
    echo "Warning: Could not auto-detect public IP"
    read -p "Enter your server's public IP address: " PUBLIC_IP
fi

# Create new configuration
cat > /etc/turnserver.conf <<TURNCFG
# Coturn Configuration for bitm-ng
# Generated on $(date)

# Listening interfaces
listening-ip=${PRIVATE_IP}
listening-port=3478

# External IP (replace with your server's public IP)
external-ip=${PUBLIC_IP}

# Realm
realm=${REALM}

# Authentication
user=${TURN_USERNAME}:${TURN_PASSWORD}
static-auth-secret=${TURN_PASSWORD}

# Logging
log-file=/var/log/turnserver.log
verbose
fingerprint
lt-cred-mech

# Security
no-cli
no-tls
no-dtls
no-tcp-relay

# Relay ports (UDP only for now)
min-port=49152
max-port=65535

# Performance
total-quota=100
user-quota=12
stale-nonce=600

# Deny RFC1918 addresses
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=172.16.0.0-172.31.255.255
denied-peer-ip=192.168.0.0-192.168.255.255

# Allow localhost for testing
allowed-peer-ip=127.0.0.1
allowed-peer-ip=${PRIVATE_IP}
TURNCFG

echo "[7/7] Starting Coturn service..."
systemctl enable coturn
systemctl restart coturn

# Wait a moment for service to start
sleep 3

# Check status
if systemctl is-active --quiet coturn; then
    echo "✓ Coturn is running"
else
    echo "✗ Coturn failed to start. Check logs: journalctl -u coturn"
    exit 1
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Server Information:"
echo "  Public IP: ${PUBLIC_IP}"
echo "  Private IP: ${PRIVATE_IP}"
echo "  TURN Port: 3478"
echo "  Relay Ports: 49152-65535"
echo ""
echo "Credentials saved to: /root/turn-credentials.txt"
echo ""
echo "TURN Server URL: turn:${PUBLIC_IP}:3478"
echo "TURN Username: ${TURN_USERNAME}"
echo "TURN Password: ${TURN_PASSWORD}"
echo ""
echo "=== IMPORTANT: Save these values for main server configuration ==="
echo ""
echo "Next steps:"
echo "  1. Run: ./test-turn-server.sh (to verify setup)"
echo "  2. Run: ./export-turn-config.sh (to get config for main server)"
echo "  3. Save the exported configuration securely"

