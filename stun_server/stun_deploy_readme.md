# STUN/TURN Server Deployment Guide

This guide walks you through setting up a dedicated STUN/TURN server for bitm-ng using Coturn. The TURN server is essential for WebRTC connections when clients are behind NATs or firewalls.

## Prerequisites

- **VPS Server**: Minimum 2 GB RAM, 2 vCPU, 20 GB SSD
- **Operating System**: Ubuntu 22.04 LTS or Debian 12 (recommended)
- **Root Access**: SSH access with sudo/root privileges
- **Network**: Public IP address, ports 3478 (TCP/UDP) and 49152-65535 (UDP) open

## Quick Start

1. **SSH into your TURN server**
   ```bash
   ssh root@your-turn-server-ip
   ```

2. **Download or create the setup script**
   ```bash
   # If you have the scripts locally, upload them via SCP
   # Or create them directly on the server
   ```

3. **Make scripts executable**
   ```bash
   chmod +x setup-turn-server.sh
   chmod +x test-turn-server.sh
   chmod +x export-turn-config.sh
   chmod +x monitor-turn.sh
   ```

4. **Run the setup script**
   ```bash
   sudo ./setup-turn-server.sh
   ```

5. **Test the server**
   ```bash
   sudo ./test-turn-server.sh
   ```

6. **Export configuration for main server**
   ```bash
   ./export-turn-config.sh > turn-config.txt
   ```

7. **Save the configuration** - You'll need these values for your main bitm-ng server!

## Scripts Overview

### `setup-turn-server.sh`
**Purpose**: Initial server setup and configuration

**What it does**:
- Updates system packages
- Installs Coturn, iptables-persistent, and dependencies
- Configures iptables firewall rules
- Generates secure TURN credentials
- Configures Coturn with optimal settings
- Starts and enables the Coturn service

**Usage**:
```bash
sudo ./setup-turn-server.sh
```

**Important Notes**:
- Must be run as root or with sudo
- Automatically detects public IP (may prompt if detection fails)
- Credentials are saved to `/root/turn-credentials.txt`
- Firewall rules are saved and persist across reboots

### `test-turn-server.sh`
**Purpose**: Verify TURN server is working correctly

**What it does**:
- Checks if Coturn service is running
- Verifies ports are listening
- Tests firewall rules
- Runs STUN connectivity test
- Runs TURN relay authentication test

**Usage**:
```bash
sudo ./test-turn-server.sh
```

**Requirements**:
- Requires `/root/turn-credentials.txt` (created by setup script)
- Optional: `coturn-utils` package for full testing (`apt-get install coturn-utils`)

### `export-turn-config.sh`
**Purpose**: Export configuration in multiple formats for main server

**What it does**:
- Reads credentials from `/root/turn-credentials.txt`
- Detects public IP address
- Outputs configuration in:
  - YAML format (for config.yaml)
  - Environment variables
  - JSON format
  - TypeScript/JavaScript format

**Usage**:
```bash
./export-turn-config.sh
# Or save to file:
./export-turn-config.sh > turn-config.txt
```

**Output**: Multiple configuration formats ready to copy into your main server config.

### `monitor-turn.sh`
**Purpose**: Monitor server health and status

**What it does**:
- Shows service status
- Lists listening ports
- Displays firewall rules
- Shows process and resource usage
- Displays recent logs
- Shows server information

**Usage**:
```bash
sudo ./monitor-turn.sh
```

**Use Cases**:
- Troubleshooting connection issues
- Monitoring resource usage
- Checking service health
- Debugging configuration problems

### `setup-turn-tls.sh` (Optional)
**Purpose**: Add TLS/DTLS encryption support

**What it does**:
- Obtains Let's Encrypt SSL certificate
- Configures TLS/DTLS ports (5349)
- Updates firewall rules
- Restarts Coturn with TLS support

**Usage**:
```bash
sudo ./setup-turn-tls.sh
```

**Requirements**:
- Domain name with DNS pointing to server
- Ports 80 and 5349 open (for certificate validation)

**Note**: TLS is optional. UDP TURN works fine without it, but TLS adds encryption for the signaling.

## Step-by-Step Deployment

### Step 1: Initial Server Setup

1. **Connect to your server**
   ```bash
   ssh root@your-server-ip
   ```

2. **Update system** (if not done by setup script)
   ```bash
   apt-get update && apt-get upgrade -y
   ```

3. **Run setup script**
   ```bash
   chmod +x setup-turn-server.sh
   sudo ./setup-turn-server.sh
   ```

4. **Verify output** - The script will display:
   - Public IP address
   - TURN server URL
   - Username and password
   - Save these values!

### Step 2: Verify Installation

1. **Run test script**
   ```bash
   sudo ./test-turn-server.sh
   ```

2. **Check service status manually** (optional)
   ```bash
   systemctl status coturn
   journalctl -u coturn -n 50
   ```

3. **Test from external machine** (optional)
   ```bash
   # Install test tools
   # macOS: brew install coturn
   # Linux: apt-get install coturn-utils
   
   # Test STUN
   turnutils_stunclient YOUR_SERVER_IP
   
   # Test TURN (requires credentials)
   turnutils_rfc5769check -t YOUR_SERVER_IP \
     -u YOUR_USERNAME -w YOUR_PASSWORD
   ```

### Step 3: Export Configuration

1. **Export config for main server**
   ```bash
   ./export-turn-config.sh > turn-config.txt
   ```

2. **Review the output** - Contains:
   - YAML configuration
   - Environment variables
   - JSON format
   - TypeScript format

3. **Save securely** - These credentials are needed for main server!

### Step 4: Configure Main Server

Copy the configuration from `export-turn-config.sh` into your main bitm-ng server's `config.yaml`:

```yaml
webrtc:
  stunServers:
    - urls: "stun:YOUR_TURN_IP:3478"
    - urls: "stun:stun.l.google.com:19302"
  turnServers:
    - urls: "turn:YOUR_TURN_IP:3478?transport=udp"
      username: "YOUR_USERNAME"
      credential: "YOUR_PASSWORD"
```

## Firewall Configuration (iptables)

The setup script configures iptables with these rules:

- **SSH (22/tcp)**: Allowed for remote access
- **STUN/TURN (3478/tcp, 3478/udp)**: Main TURN server port
- **TURN Relay Range (49152-65535/udp)**: Port range for media relay
- **ICMP**: Ping allowed for troubleshooting
- **Default Policy**: DROP for INPUT, ACCEPT for OUTPUT

**View current rules**:
```bash
iptables -L -n -v
```

**View saved rules**:
```bash
cat /etc/iptables/rules.v4
```

**Manual rule management**:
```bash
# Add rule
iptables -A INPUT -p tcp --dport 3478 -j ACCEPT

# Save rules
iptables-save > /etc/iptables/rules.v4

# Restore rules
iptables-restore < /etc/iptables/rules.v4
```

## Configuration Files

### `/etc/turnserver.conf`
Main Coturn configuration file. Key settings:

- `listening-ip`: Private IP address
- `listening-port`: 3478 (default)
- `external-ip`: Public IP address
- `realm`: Authentication realm
- `user`: TURN username:password
- `min-port`/`max-port`: Relay port range

**Edit configuration**:
```bash
nano /etc/turnserver.conf
systemctl restart coturn
```

### `/root/turn-credentials.txt`
Contains generated credentials:
- `TURN_USERNAME`: Authentication username
- `TURN_PASSWORD`: Authentication password
- `REALM`: Authentication realm

**Security**: File is readable only by root (chmod 600).

## Troubleshooting

### Coturn Won't Start

1. **Check logs**:
   ```bash
   journalctl -u coturn -n 50
   tail -f /var/log/turnserver.log
   ```

2. **Test configuration**:
   ```bash
   turnserver -c /etc/turnserver.conf --log-file=stdout
   ```

3. **Common issues**:
   - Port already in use: Check with `netstat -tuln | grep 3478`
   - Invalid IP address: Verify `external-ip` in config
   - Permission issues: Ensure running as root

### Can't Connect from External Clients

1. **Check firewall**:
   ```bash
   iptables -L INPUT -n -v | grep 3478
   ```

2. **Verify ports are listening**:
   ```bash
   netstat -tuln | grep 3478
   ss -tuln | grep 3478
   ```

3. **Test from external machine**:
   ```bash
   # From another machine
   telnet YOUR_SERVER_IP 3478
   # Or
   nc -uv YOUR_SERVER_IP 3478
   ```

4. **Check VPS provider firewall**:
   - Some providers have additional firewall layers
   - Check VPS control panel for firewall rules

### High Resource Usage

1. **Monitor resources**:
   ```bash
   ./monitor-turn.sh
   top -p $(pgrep turnserver)
   ```

2. **Adjust limits in `/etc/turnserver.conf`**:
   ```
   total-quota=100      # Total bandwidth quota
   user-quota=12        # Per-user quota
   ```

3. **Check connection count**:
   ```bash
   ss -s | grep ESTAB
   ```

### Authentication Failures

1. **Verify credentials**:
   ```bash
   cat /root/turn-credentials.txt
   ```

2. **Check config file**:
   ```bash
   grep "^user" /etc/turnserver.conf
   ```

3. **Test with turnutils**:
   ```bash
   turnutils_rfc5769check -t YOUR_IP -u USERNAME -w PASSWORD
   ```

## Security Considerations

1. **Credentials**: Keep `/root/turn-credentials.txt` secure
2. **Firewall**: Only open necessary ports
3. **Updates**: Regularly update system packages
4. **Monitoring**: Monitor logs for suspicious activity
5. **TLS**: Consider enabling TLS/DTLS for encrypted connections

## Maintenance

### Regular Tasks

1. **Monitor logs**:
   ```bash
   tail -f /var/log/turnserver.log
   ```

2. **Check service status**:
   ```bash
   systemctl status coturn
   ```

3. **Update packages**:
   ```bash
   apt-get update && apt-get upgrade -y
   ```

4. **Restart service** (if needed):
   ```bash
   systemctl restart coturn
   ```

### Backup

Important files to backup:
- `/etc/turnserver.conf` - Configuration
- `/root/turn-credentials.txt` - Credentials
- `/etc/iptables/rules.v4` - Firewall rules

```bash
# Create backup
tar -czf turn-server-backup-$(date +%Y%m%d).tar.gz \
  /etc/turnserver.conf \
  /root/turn-credentials.txt \
  /etc/iptables/rules.v4
```

## Performance Tuning

### For High Traffic

Edit `/etc/turnserver.conf`:

```
# Increase quotas
total-quota=1000
user-quota=50

# Adjust relay ports (if needed)
min-port=50000
max-port=60000

# Enable verbose logging (disable in production)
# verbose
```

### System Limits

Increase file descriptor limits:

```bash
# Edit /etc/security/limits.conf
* soft nofile 65535
* hard nofile 65535

# Apply
ulimit -n 65535
```

## Next Steps

After setting up the TURN server:

1. ✅ Save the configuration output from `export-turn-config.sh`
2. ✅ Test connectivity from external machines
3. ✅ Document your server IP and credentials securely
4. ✅ Proceed to main server setup with TURN configuration

## Support

If you encounter issues:

1. Check logs: `journalctl -u coturn -n 100`
2. Run monitor script: `./monitor-turn.sh`
3. Verify firewall: `iptables -L -n -v`
4. Test connectivity: `./test-turn-server.sh`

## Additional Resources

- [Coturn Documentation](https://github.com/coturn/coturn)
- [WebRTC TURN Server Guide](https://webrtc.org/getting-started/turn-server)
- [RFC 5766 - TURN Protocol](https://tools.ietf.org/html/rfc5766)

---

**Remember**: Keep your TURN server credentials secure! They're required for the main bitm-ng server to establish WebRTC connections.

