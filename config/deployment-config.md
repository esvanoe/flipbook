# Deployment Configuration

This file stores deployment-specific configuration information for the CuddlePhish platform.

## Server Information

### DNS
- **Domain**: `www.remote-login.us`
- **Note**: DNS entry configured for this server

## TURN Server Configuration

**Status**: ✅ Configured

**Server Details:**
- **IP Address**: `54.176.155.54`
- **STUN Port**: `3478` (UDP)
- **TURN Port**: `3478` (UDP) - Standard TURN
- **TLS/DTLS Port**: `5349` (TCP for TLS, UDP for DTLS) - *Requires domain name, not IP*
- **Username**: `bitm-ng-turn`
- **Credential**: `31080844b31e7d67ce0f3ccab396246040e5948d3bfb380aff1e8ae68ecf11a4`
- **TLS Domain**: `turn.remote-login.us` (for TLS/DTLS connections on port 5349)

### Configuration Formats

#### YAML (for config.yaml)
```yaml
webrtc:
  stunServers:
    - urls: "stun:54.176.155.54:3478"
    - urls: "stun:stun.l.google.com:19302"
    - urls: "stun:stun1.l.google.com:19302"
  turnServers:
    - urls: "turn:54.176.155.54:3478?transport=udp"
      username: "bitm-ng-turn"
      credential: "31080844b31e7d67ce0f3ccab396246040e5948d3bfb380aff1e8ae68ecf11a4"
    # TLS/DTLS support (port 5349 - requires domain name for TLS certificate)
    - urls: "turns:turn.remote-login.us:5349?transport=tcp"
      username: "bitm-ng-turn"
      credential: "31080844b31e7d67ce0f3ccab396246040e5948d3bfb380aff1e8ae68ecf11a4"
    - urls: "turn:turn.remote-login.us:5349?transport=udp"
      username: "bitm-ng-turn"
      credential: "31080844b31e7d67ce0f3ccab396246040e5948d3bfb380aff1e8ae68ecf11a4"
```

#### Environment Variables
```bash
export TURN_SERVER_IP="54.176.155.54"
export TURN_SERVER_PORT="3478"
export TURN_SERVER_TLS_PORT="5349"
export TURN_USERNAME="bitm-ng-turn"
export TURN_PASSWORD="31080844b31e7d67ce0f3ccab396246040e5948d3bfb380aff1e8ae68ecf11a4"
```

#### TypeScript/JavaScript
```typescript
const iceServers: RTCIceServer[] = [
  { urls: 'stun:54.176.155.54:3478' },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  {
    urls: 'turn:54.176.155.54:3478?transport=udp',
    username: 'bitm-ng-turn',
    credential: '31080844b31e7d67ce0f3ccab396246040e5948d3bfb380aff1e8ae68ecf11a4'
  },
  // TLS/DTLS support (port 5349 - requires domain name for TLS certificate)
  {
    urls: 'turns:turn.remote-login.us:5349?transport=tcp',
    username: 'bitm-ng-turn',
    credential: '31080844b31e7d67ce0f3ccab396246040e5948d3bfb380aff1e8ae68ecf11a4'
  },
  {
    urls: 'turn:turn.remote-login.us:5349?transport=udp',
    username: 'bitm-ng-turn',
    credential: '31080844b31e7d67ce0f3ccab396246040e5948d3bfb380aff1e8ae68ecf11a4'
  }
];
```

### Notes

**STUN vs TURN Clarification:**
- **STUN servers** (stun.l.google.com, etc.): These are public fallback STUN servers provided by Google. They're correct and used as backups when the primary STUN server is unavailable.
- **TURN server**: This is YOUR server at `54.176.155.54` / `turn.remote-login.us` - this is what handles the actual media relay.

⚠️ **TLS Port Clarification**: 
- **Standard TURN**: Uses port `3478` (UDP) - can use IP address (`54.176.155.54`)
- **TLS/DTLS TURN**: Uses port `5349` (TCP for TLS, UDP for DTLS) - **requires domain name** (`turn.remote-login.us`) because TLS certificates are domain-based

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

---

**Last Updated**: 2025-12-10  
**Status**: ✅ TURN server configured

