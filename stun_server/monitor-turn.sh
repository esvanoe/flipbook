#!/bin/bash
# monitor-turn.sh
# Monitors TURN server health and status

echo "=== TURN Server Status Monitor ==="
echo "Generated: $(date)"
echo ""

# Service status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Service Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if systemctl is-active --quiet coturn; then
    echo "✓ Coturn is running"
    systemctl status coturn --no-pager -l | head -n 15
else
    echo "✗ Coturn is not running"
    echo "  Start with: systemctl start coturn"
fi
echo ""

# Port status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Listening Ports"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v ss &> /dev/null; then
    ss -tuln | grep -E ":(3478|5349)" || echo "No TURN ports found"
else
    netstat -tuln 2>/dev/null | grep -E ":(3478|5349)" || echo "No TURN ports found"
fi
echo ""

# Firewall status
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Firewall Rules (iptables)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
iptables -L INPUT -n -v | grep -E "3478|5349" || echo "No TURN-related firewall rules found"
echo ""

# Process information
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Process Information"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
ps aux | grep -E "turnserver|coturn" | grep -v grep || echo "Coturn process not found"
echo ""

# Resource usage
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Resource Usage"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if pgrep -x turnserver > /dev/null; then
    PID=$(pgrep -x turnserver)
    echo "PID: ${PID}"
    ps -p ${PID} -o pid,vsz,rss,%cpu,%mem,etime,cmd
fi
echo ""

# Network statistics
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Network Statistics"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if command -v ss &> /dev/null; then
    echo "Active connections:"
    ss -s | head -n 10
else
    netstat -s | head -n 20
fi
echo ""

# Recent logs
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Recent Logs (last 20 lines)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f /var/log/turnserver.log ]; then
    tail -n 20 /var/log/turnserver.log
elif [ -f /var/log/syslog ]; then
    grep -i coturn /var/log/syslog | tail -n 20 || echo "No recent Coturn logs in syslog"
else
    journalctl -u coturn -n 20 --no-pager 2>/dev/null || echo "No logs available"
fi
echo ""

# Server information
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Server Information"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
PUBLIC_IP=$(curl -s ifconfig.me || curl -s ipinfo.io/ip || curl -s icanhazip.com)
PRIVATE_IP=$(hostname -I | awk '{print $1}')
echo "Public IP: ${PUBLIC_IP}"
echo "Private IP: ${PRIVATE_IP}"
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime -p 2>/dev/null || uptime)"
echo ""

# Configuration check
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Configuration Check"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ -f /etc/turnserver.conf ]; then
    echo "✓ Configuration file exists: /etc/turnserver.conf"
    echo "  Listening port: $(grep '^listening-port' /etc/turnserver.conf | awk '{print $2}' || echo 'not set')"
    echo "  External IP: $(grep '^external-ip' /etc/turnserver.conf | awk '{print $2}' || echo 'not set')"
    if grep -q "tls-listening-port" /etc/turnserver.conf; then
        echo "  TLS enabled: Yes"
    else
        echo "  TLS enabled: No"
    fi
else
    echo "✗ Configuration file not found"
fi
echo ""

echo "=== End of Status Report ==="
