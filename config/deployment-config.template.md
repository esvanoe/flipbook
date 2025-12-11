# Deployment Configuration

This file stores deployment-specific configuration information for the CuddlePhish platform.

## Server Information

### DNS
- **Domain**: `www.example.com`
- **Note**: DNS entry configured for this server

## TURN Server Configuration

**Status**: ⚠️ Configuration Required

**Server Details:**
- **IP Address**: `YOUR_SERVER_IP`
- **STUN Port**: `3478` (UDP)
- **TURN Port**: `3478` (UDP) - Standard TURN
- **TLS/DTLS Port**: `5349` (TCP for TLS, UDP for DTLS) - *Requires domain name, not IP*
- **Username**: `YOUR_TURN_USERNAME`
- **Credential**: `YOUR_TURN_CREDENTIAL`
- **TLS Domain**: `turn.example.com` (for TLS/DTLS connections on port 5349)

### Configuration Formats

#### YAML (for config.yaml)
```yaml
webrtc:
  stunServers:
    - urls: "stun:YOUR_SERVER_IP:3478"
    - urls: "stun:stun.l.google.com:19302"
    - urls: "stun:stun1.l.google.com:19302"
  turnServers:
    - urls: "turn:YOUR_SERVER_IP:3478?transport=udp"
      username: "YOUR_TURN_USERNAME"
      credential: "YOUR_TURN_CREDENTIAL"
    # TLS/DTLS support (port 5349 - requires domain name for TLS certificate)
    - urls: "turns:turn.example.com:5349?transport=tcp"
      username: "YOUR_TURN_USERNAME"
      credential: "YOUR_TURN_CREDENTIAL"
    - urls: "turn:turn.example.com:5349?transport=udp"
      username: "YOUR_TURN_USERNAME"
      credential: "YOUR_TURN_CREDENTIAL"
```

#### Environment Variables
```bash
export TURN_SERVER_IP="YOUR_SERVER_IP"
export TURN_SERVER_PORT="3478"
export TURN_SERVER_TLS_PORT="5349"
export TURN_USERNAME="YOUR_TURN_USERNAME"
export TURN_PASSWORD="YOUR_TURN_CREDENTIAL"
```

#### TypeScript/JavaScript
```typescript
const iceServers: RTCIceServer[] = [
  { urls: 'stun:YOUR_SERVER_IP:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:YOUR_SERVER_IP:3478?transport=udp',
    username: 'YOUR_TURN_USERNAME',
    credential: 'YOUR_TURN_CREDENTIAL'
  },
  // TLS/DTLS support (port 5349 - requires domain name for TLS certificate)
  {
    urls: 'turns:turn.example.com:5349?transport=tcp',
    username: 'YOUR_TURN_USERNAME',
    credential: 'YOUR_TURN_CREDENTIAL'
  },
  {
    urls: 'turn:turn.example.com:5349?transport=udp',
    username: 'YOUR_TURN_USERNAME',
    credential: 'YOUR_TURN_CREDENTIAL'
  }
];
```

### Notes

**STUN vs TURN Clarification:**
- **STUN servers** (stun.l.google.com, etc.): These are public fallback STUN servers provided by Google. They're correct and used as backups when the primary STUN server is unavailable.
- **TURN server**: This is YOUR server - this is what handles the actual media relay.

⚠️ **TLS Port Clarification**: 
- **Standard TURN**: Uses port `3478` (UDP) - can use IP address
- **TLS/DTLS TURN**: Uses port `5349` (TCP for TLS, UDP for DTLS) - **requires domain name** because TLS certificates are domain-based

⚠️ **Export Script Limitation**: The `export-turn-config.sh` script was updated to detect and include TLS endpoints, but if it was run before TLS setup or doesn't detect TLS properly, it won't show TLS endpoints. The script now:
- Detects TLS by checking `/etc/turnserver.conf` for `tls-listening-port`
- Extracts domain from certificate path or prompts for it
- Includes TLS endpoints in all output formats

**To get complete TLS configuration:**
1. Run the updated `export-turn-config.sh` script on your TURN server
2. Or provide the domain name used for the TLS certificate so we can add TLS endpoints manually

### Example Format:
```yaml
turn:
  servers:
    - urls: "turn:turn.example.com:3478?transport=tcp"
      username: "your-username"
      credential: "your-password"
    - urls: "turn:turn.example.com:3478?transport=udp"
      username: "your-username"
      credential: "your-password"
```

## STUN Servers

Default STUN servers (can be overridden):
```yaml
stun:
  servers:
    - urls: "stun:stun.l.google.com:19302"
    - urls: "stun:stun1.l.google.com:19302"
```

## Notes

- TURN server configuration will be integrated into the application config
- DNS entry will be used for reverse proxy configuration (Caddy/Nginx)
- All sensitive credentials should be stored in environment variables, not in code
- **Copy this template to `deployment-config.md` and fill in your actual values**
- **Never commit `deployment-config.md` - it contains sensitive information**

---

**Last Updated**: Template created  
**Status**: ⚠️ Configuration Required

