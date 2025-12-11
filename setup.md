# Platform Setup Documentation

This document outlines the complete setup process for building the CuddlePhish platform from scratch on a fresh Ubuntu 22.04 system. All steps have been tested and verified.

## Quick Start

For automated installation, use the provided setup script:

```bash
./scripts/setup-platform.sh
```

This script performs all installation steps automatically with error handling and logging.

For manual installation, follow the step-by-step guide below.

## Prerequisites

- Fresh Ubuntu 22.04 (Jammy) installation
- User with sudo privileges
- Internet connectivity
- At least 2GB RAM and 10GB disk space

## Overview

This setup installs:
1. Node.js 20.x LTS
2. Docker and Docker Compose
3. Xvfb (X Virtual Framebuffer) for headless browser rendering
4. Chromium browser and dependencies
5. Build tools (gcc, make, python3)

## Step-by-Step Installation

### 1. Update System Packages

```bash
sudo apt update
```

### 2. Install Basic Utilities

```bash
sudo apt install -y curl wget gnupg ca-certificates lsb-release
```

**Purpose:** Essential tools for downloading packages and managing repositories.

### 3. Install Node.js 20.x LTS

#### 3.1 Add NodeSource Repository

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
```

**Purpose:** Adds the official NodeSource repository for Node.js 20.x LTS.

#### 3.2 Install Node.js

```bash
sudo apt install -y nodejs
```

**Verification:**
```bash
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 4. Install Docker and Docker Compose

#### 4.1 Add Docker GPG Key

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

**Purpose:** Adds Docker's official GPG key for package verification.

#### 4.2 Add Docker Repository

```bash
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
```

**Purpose:** Adds Docker's official repository to the system.

#### 4.3 Install Docker

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

**Components:**
- `docker-ce`: Docker Community Edition
- `docker-ce-cli`: Docker CLI
- `containerd.io`: Container runtime
- `docker-buildx-plugin`: Extended build capabilities
- `docker-compose-plugin`: Docker Compose v2

#### 4.4 Add User to Docker Group

```bash
sudo usermod -aG docker $USER
```

**Note:** User must log out and back in (or run `newgrp docker`) for group membership to take effect.

**Verification:**
```bash
docker --version
docker compose version
```

### 5. Install Xvfb and Browser Dependencies

#### 5.1 Install Xvfb and Chromium with All Dependencies

```bash
sudo apt install -y \
  xvfb \
  x11vnc \
  chromium-browser \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  xdg-utils
```

**Purpose:** 
- `xvfb`: Virtual framebuffer for headless X server (required for Puppeteer)
- `x11vnc`: VNC server for remote debugging (optional)
- `chromium-browser`: Chromium browser for Puppeteer
- All other packages: Required libraries for Chromium to run in headless mode

**Verification:**
```bash
Xvfb -help 2>&1 | head -3
chromium-browser --version
```

### 6. Install Build Tools

```bash
sudo apt install -y build-essential python3 git
```

**Components:**
- `build-essential`: gcc, g++, make, and other compilation tools
- `python3`: Python 3 (required for some npm packages with native bindings)
- `git`: Version control (if not already installed)

**Verification:**
```bash
which make gcc python3 git
```

## Complete Installation Script

For convenience, here's a complete script that performs all steps:

```bash
#!/bin/bash
set -e  # Exit on error

echo "=== CuddlePhish Platform Setup ==="
echo "This script will install all prerequisites for the platform."
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   echo "Please do not run as root. Run as a user with sudo privileges."
   exit 1
fi

# Step 1: Update system
echo "[1/6] Updating system packages..."
sudo apt update

# Step 2: Install basic utilities
echo "[2/6] Installing basic utilities..."
sudo apt install -y curl wget gnupg ca-certificates lsb-release

# Step 3: Install Node.js 20.x
echo "[3/6] Installing Node.js 20.x LTS..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Verify Node.js installation
if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js installation failed"
    exit 1
fi
echo "✓ Node.js $(node --version) installed"
echo "✓ npm $(npm --version) installed"

# Step 4: Install Docker
echo "[4/6] Installing Docker and Docker Compose..."
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER

# Verify Docker installation
if ! command -v docker &> /dev/null; then
    echo "ERROR: Docker installation failed"
    exit 1
fi
echo "✓ Docker $(docker --version | cut -d' ' -f3 | tr -d ',') installed"
echo "✓ Docker Compose $(docker compose version | cut -d' ' -f4) installed"
echo "⚠ Note: You may need to log out and back in to use Docker without sudo"

# Step 5: Install Xvfb and browser dependencies
echo "[5/6] Installing Xvfb and Chromium dependencies..."
sudo apt install -y \
  xvfb \
  x11vnc \
  chromium-browser \
  fonts-liberation \
  libappindicator3-1 \
  libasound2 \
  libatk-bridge2.0-0 \
  libatk1.0-0 \
  libcups2 \
  libdbus-1-3 \
  libdrm2 \
  libgbm1 \
  libgdk-pixbuf2.0-0 \
  libglib2.0-0 \
  libgtk-3-0 \
  libnspr4 \
  libnss3 \
  libpango-1.0-0 \
  libpangocairo-1.0-0 \
  libx11-6 \
  libx11-xcb1 \
  libxcb1 \
  libxcomposite1 \
  libxcursor1 \
  libxdamage1 \
  libxext6 \
  libxfixes3 \
  libxi6 \
  libxrandr2 \
  libxrender1 \
  libxss1 \
  libxtst6 \
  xdg-utils

# Verify Xvfb and Chromium
if ! command -v Xvfb &> /dev/null; then
    echo "ERROR: Xvfb installation failed"
    exit 1
fi
echo "✓ Xvfb installed"
echo "✓ Chromium installed"

# Step 6: Install build tools
echo "[6/6] Installing build tools..."
sudo apt install -y build-essential python3 git

# Verify build tools
if ! command -v make &> /dev/null || ! command -v gcc &> /dev/null || ! command -v python3 &> /dev/null; then
    echo "ERROR: Build tools installation failed"
    exit 1
fi
echo "✓ Build tools installed"

# Final summary
echo ""
echo "=== Installation Complete ==="
echo ""
echo "Installed components:"
echo "  - Node.js: $(node --version)"
echo "  - npm: $(npm --version)"
echo "  - Docker: $(docker --version | cut -d' ' -f3 | tr -d ',')"
echo "  - Docker Compose: $(docker compose version | cut -d' ' -f4)"
echo "  - Xvfb: $(which Xvfb)"
echo "  - Chromium: $(which chromium-browser)"
echo ""
echo "Next steps:"
echo "  1. Log out and back in (or run 'newgrp docker') to use Docker without sudo"
echo "  2. Proceed with Phase 1: Foundation setup"
echo ""
```

## Post-Installation Verification

Run these commands to verify everything is installed correctly:

```bash
# Node.js and npm
node --version
npm --version

# Docker
docker --version
docker compose version

# Xvfb
Xvfb -help 2>&1 | head -3

# Chromium
chromium-browser --version

# Build tools
which make gcc python3 git
```

## Troubleshooting

### Docker Permission Denied

If you get "permission denied" errors with Docker:

```bash
# Option 1: Log out and back in
# Option 2: Use newgrp to activate docker group
newgrp docker

# Option 3: Use sudo (not recommended for production)
sudo docker ...
```

### Node.js Version Issues

If Node.js version is incorrect:

```bash
# Remove existing Node.js
sudo apt remove nodejs npm

# Re-run NodeSource setup
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### Chromium Not Found

If Chromium is not found:

```bash
# Check if installed
dpkg -l | grep chromium

# Reinstall if needed
sudo apt install --reinstall chromium-browser
```

## System Requirements

**Minimum:**
- CPU: 2 cores
- RAM: 2GB
- Disk: 10GB free space
- OS: Ubuntu 22.04 LTS

**Recommended:**
- CPU: 4+ cores
- RAM: 4GB+
- Disk: 20GB+ free space
- OS: Ubuntu 22.04 LTS

## Disk Space Usage

Approximate disk space used by prerequisites:
- Node.js: ~200MB
- Docker: ~400MB
- Chromium + dependencies: ~400MB
- Build tools: ~1GB
- **Total: ~2GB**

## Notes

1. **Docker Group**: After adding user to docker group, you must log out/in or use `newgrp docker` for changes to take effect.

2. **Chromium vs Chrome**: We use Chromium (open-source) instead of Chrome (proprietary) for better compatibility and licensing.

3. **Xvfb Display**: Xvfb creates virtual displays. Default display is `:99`. You can specify a different display with `DISPLAY=:99`.

4. **Build Tools**: Required for npm packages with native bindings (e.g., `puppeteer`, `bcrypt`, etc.).

5. **Firewall**: Ensure ports 58082 (application) and 6379 (Redis, if external) are open if needed.

## Future Enhancements

When converting this to a deployment script, consider:

1. **Idempotency**: Check if packages are already installed before installing
2. **Progress Indicators**: Add progress bars for long operations
3. **Error Recovery**: Better error handling and rollback capabilities
4. **Configuration**: Allow customization of versions, paths, etc.
5. **Logging**: Log all operations to a file for debugging
6. **Validation**: Pre-flight checks (OS version, disk space, etc.)
7. **Non-interactive Mode**: Support for fully automated deployments
8. **Multi-OS Support**: Extend to support other Linux distributions

## References

- [Node.js Installation Guide](https://github.com/nodesource/distributions)
- [Docker Installation Guide](https://docs.docker.com/engine/install/ubuntu/)
- [Puppeteer Requirements](https://github.com/puppeteer/puppeteer/blob/main/docs/troubleshooting.md)
- [Xvfb Documentation](https://www.x.org/releases/X11R7.6/doc/man/man1/Xvfb.1.xhtml)

---

**Last Updated:** 2025-12-10  
**Tested On:** Ubuntu 22.04.3 LTS  
**Installation Time:** ~5-10 minutes (depending on network speed)

