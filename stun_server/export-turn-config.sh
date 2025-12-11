#!/bin/bash
# export-turn-config.sh
# Exports TURN server configuration in multiple formats for main server setup

set -e

# Check if credentials file exists
if [ ! -f /root/turn-credentials.txt ]; then
    echo "✗ Credentials file not found: /root/turn-credentials.txt"
    echo "  Run setup-turn-server.sh first"
    exit 1
fi

# Load credentials
source /root/turn-credentials.txt

# Get public IP
PUBLIC_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || curl -s icanhazip.com)
if [ -z "$PUBLIC_IP" ]; then
    echo "✗ Could not determine public IP"
    read -p "Enter your server's public IP address: " PUBLIC_IP
fi

# Check if TLS is configured
TLS_ENABLED=false
TLS_DOMAIN=""
if [ -f /etc/turnserver.conf ] && grep -q "tls-listening-port" /etc/turnserver.conf; then
    TLS_ENABLED=true
    # Try to extract domain from certificate path
    CERT_PATH=$(grep "^cert=" /etc/turnserver.conf | cut -d'=' -f2 | head -1)
    if [ -n "$CERT_PATH" ]; then
        # Extract domain from /etc/letsencrypt/live/DOMAIN/fullchain.pem
        TLS_DOMAIN=$(echo "$CERT_PATH" | sed -n 's|.*/live/\([^/]*\)/.*|\1|p')
    fi
    if [ -z "$TLS_DOMAIN" ]; then
        read -p "TLS is enabled. Enter your TURN server domain name (or press Enter to use IP): " TLS_DOMAIN
        if [ -z "$TLS_DOMAIN" ]; then
            TLS_DOMAIN="$PUBLIC_IP"
        fi
    fi
fi

echo "=== TURN Server Configuration Export ==="
echo ""
echo "Save this configuration for your main bitm-ng server:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "YAML Format (for config.yaml)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat <<YAML
webrtc:
  stunServers:
    - urls: "stun:${PUBLIC_IP}:3478"
    - urls: "stun:stun.l.google.com:19302"
    - urls: "stun:stun1.l.google.com:19302"
  turnServers:
    - urls: "turn:${PUBLIC_IP}:3478?transport=udp"
      username: "${TURN_USERNAME}"
      credential: "${TURN_PASSWORD}"
YAML

if [ "$TLS_ENABLED" = true ]; then
    cat <<TLSYAML
    - urls: "turns:${TLS_DOMAIN}:5349?transport=tcp"
      username: "${TURN_USERNAME}"
      credential: "${TURN_PASSWORD}"
    - urls: "turn:${TLS_DOMAIN}:5349?transport=udp"
      username: "${TURN_USERNAME}"
      credential: "${TURN_PASSWORD}"
TLSYAML
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Environment Variables Format"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat <<ENV
export TURN_SERVER_URL="turn:${PUBLIC_IP}:3478"
export TURN_USERNAME="${TURN_USERNAME}"
export TURN_PASSWORD="${TURN_PASSWORD}"
export STUN_SERVER_URL="stun:${PUBLIC_IP}:3478"
ENV
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "JSON Format (for programmatic use)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat <<JSON
{
  "webrtc": {
    "stunServers": [
      { "urls": "stun:${PUBLIC_IP}:3478" },
      { "urls": "stun:stun.l.google.com:19302" },
      { "urls": "stun:stun1.l.google.com:19302" }
    ],
    "turnServers": [
      {
        "urls": "turn:${PUBLIC_IP}:3478?transport=udp",
        "username": "${TURN_USERNAME}",
        "credential": "${TURN_PASSWORD}"
      }$(if [ "$TLS_ENABLED" = true ]; then cat <<TLSJSON
      ,
      {
        "urls": "turns:${TLS_DOMAIN}:5349?transport=tcp",
        "username": "${TURN_USERNAME}",
        "credential": "${TURN_PASSWORD}"
      },
      {
        "urls": "turn:${TLS_DOMAIN}:5349?transport=udp",
        "username": "${TURN_USERNAME}",
        "credential": "${TURN_PASSWORD}"
      }
TLSJSON
fi)
    ]
  }
}
JSON
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "TypeScript/JavaScript Format"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
cat <<TS
const iceServers: RTCIceServer[] = [
  { urls: 'stun:${PUBLIC_IP}:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:${PUBLIC_IP}:3478?transport=udp',
    username: '${TURN_USERNAME}',
    credential: '${TURN_PASSWORD}'
  }$(if [ "$TLS_ENABLED" = true ]; then cat <<TLSTS
  ,
  {
    urls: 'turns:${TLS_DOMAIN}:5349?transport=tcp',
    username: '${TURN_USERNAME}',
    credential: '${TURN_PASSWORD}'
  },
  {
    urls: 'turn:${TLS_DOMAIN}:5349?transport=udp',
    username: '${TURN_USERNAME}',
    credential: '${TURN_PASSWORD}'
  }
TLSTS
fi)
];
TS
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Public IP: ${PUBLIC_IP}"
echo "TURN URL (UDP): turn:${PUBLIC_IP}:3478?transport=udp"
echo "STUN URL: stun:${PUBLIC_IP}:3478"
echo "Username: ${TURN_USERNAME}"
echo "Password: ${TURN_PASSWORD}"
if [ "$TLS_ENABLED" = true ]; then
    echo ""
    echo "TLS/DTLS Enabled:"
    echo "  TLS URL: turns:${TLS_DOMAIN}:5349?transport=tcp"
    echo "  DTLS URL: turn:${TLS_DOMAIN}:5349?transport=udp"
fi
echo ""
echo "⚠️  IMPORTANT: Save these credentials securely!"
echo "   They are required for the main server configuration."
echo ""
