#!/bin/bash
# test-turn-server.sh
# Tests the TURN server configuration and connectivity

set -e

echo "=== Testing TURN Server ==="
echo ""

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
    exit 1
fi

# Test if Coturn is running
echo "[1/5] Checking Coturn service..."
if systemctl is-active --quiet coturn; then
    echo "✓ Coturn is running"
else
    echo "✗ Coturn is not running"
    echo "  Start with: systemctl start coturn"
    exit 1
fi

# Test if ports are listening
echo "[2/5] Testing listening ports..."
if netstat -tuln 2>/dev/null | grep -q ":3478" || ss -tuln 2>/dev/null | grep -q ":3478"; then
    echo "✓ Port 3478 is listening"
else
    echo "✗ Port 3478 is not listening"
    echo "  Check logs: journalctl -u coturn -n 50"
fi

# Check iptables rules
echo "[3/5] Checking firewall rules..."
if iptables -L INPUT -n | grep -q "3478"; then
    echo "✓ Firewall rules for port 3478 found"
else
    echo "⚠ Firewall rules for port 3478 not found"
    echo "  Run setup-turn-server.sh to configure firewall"
fi

# Test STUN functionality
echo "[4/5] Testing STUN functionality..."
if command -v turnutils_stunclient &> /dev/null; then
    echo "  Testing STUN on ${PUBLIC_IP}..."
    STUN_OUTPUT=$(turnutils_stunclient ${PUBLIC_IP} 2>&1)
    if echo "$STUN_OUTPUT" | grep -q "Mapped address"; then
        echo "✓ STUN test successful"
        echo "$STUN_OUTPUT" | grep "Mapped address" | head -n 1
    else
        echo "⚠ STUN test returned unexpected result"
        echo "$STUN_OUTPUT"
    fi
else
    echo "⚠ turnutils_stunclient not found"
    echo "  Install with: apt-get install coturn-utils"
fi

# Test TURN relay
echo "[5/5] Testing TURN relay..."
if command -v turnutils_rfc5769check &> /dev/null; then
    echo "  Testing TURN relay with credentials..."
    if turnutils_rfc5769check -t ${PUBLIC_IP} -u ${TURN_USERNAME} -w ${TURN_PASSWORD} 2>&1 | grep -q "successful"; then
        echo "✓ TURN relay test successful"
    else
        echo "⚠ TURN relay test failed or returned unexpected result"
        turnutils_rfc5769check -t ${PUBLIC_IP} -u ${TURN_USERNAME} -w ${TURN_PASSWORD}
    fi
else
    echo "⚠ turnutils_rfc5769check not found"
    echo "  Install with: apt-get install coturn-utils"
fi

echo ""
echo "=== Server Information ==="
echo "Public IP: ${PUBLIC_IP}"
echo "TURN URL: turn:${PUBLIC_IP}:3478"
echo "Username: ${TURN_USERNAME}"
echo "Password: ${TURN_PASSWORD}"
echo ""
echo "=== Quick Connectivity Test ==="
echo "From another machine, test with:"
echo "  turnutils_stunclient ${PUBLIC_IP}"
echo ""
