#!/bin/bash
#
# CuddlePhish Platform Setup Script
# 
# This script installs all prerequisites for the CuddlePhish platform
# on a fresh Ubuntu 22.04 system.
#
# Usage: ./setup-platform.sh
#
# Requirements:
#   - Ubuntu 22.04 (Jammy)
#   - User with sudo privileges
#   - Internet connectivity
#

set -e  # Exit on error
set -o pipefail  # Exit on pipe failure

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging
LOG_FILE="/tmp/cuddlephish-setup-$(date +%Y%m%d-%H%M%S).log"
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check if running as root
if [ "$EUID" -eq 0 ]; then 
   error "Please do not run as root. Run as a user with sudo privileges."
fi

# Check OS
if [ ! -f /etc/os-release ]; then
    error "Cannot determine OS version. This script requires Ubuntu 22.04."
fi

. /etc/os-release
if [ "$ID" != "ubuntu" ] || [ "$VERSION_ID" != "22.04" ]; then
    warning "This script is designed for Ubuntu 22.04. Current OS: $ID $VERSION_ID"
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Check disk space (need at least 2GB free)
AVAILABLE_SPACE=$(df / | tail -1 | awk '{print $4}')
if [ "$AVAILABLE_SPACE" -lt 2097152 ]; then  # 2GB in KB
    error "Insufficient disk space. Need at least 2GB free. Available: $(($AVAILABLE_SPACE / 1024))MB"
fi

echo ""
echo "=========================================="
echo "  CuddlePhish Platform Setup"
echo "=========================================="
echo ""
log "Starting installation process..."
log "Log file: $LOG_FILE"
echo ""

# Step 1: Update system
log "[1/6] Updating system packages..."
sudo apt update || error "Failed to update package lists"

# Step 2: Install basic utilities
log "[2/6] Installing basic utilities..."
sudo apt install -y curl wget gnupg ca-certificates lsb-release || error "Failed to install basic utilities"

# Step 3: Install Node.js 20.x
log "[3/6] Installing Node.js 20.x LTS..."
if command -v node &> /dev/null; then
    CURRENT_NODE=$(node --version)
    log "Node.js already installed: $CURRENT_NODE"
    read -p "Reinstall Node.js? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo apt remove -y nodejs npm 2>/dev/null || true
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - || error "Failed to add NodeSource repository"
        sudo apt install -y nodejs || error "Failed to install Node.js"
    fi
else
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - || error "Failed to add NodeSource repository"
    sudo apt install -y nodejs || error "Failed to install Node.js"
fi

# Verify Node.js installation
if ! command -v node &> /dev/null; then
    error "Node.js installation failed"
fi
NODE_VERSION=$(node --version)
NPM_VERSION=$(npm --version)
success "Node.js $NODE_VERSION installed"
success "npm $NPM_VERSION installed"

# Step 4: Install Docker
log "[4/6] Installing Docker and Docker Compose..."
if command -v docker &> /dev/null; then
    CURRENT_DOCKER=$(docker --version)
    log "Docker already installed: $CURRENT_DOCKER"
    read -p "Reinstall Docker? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Skipping Docker installation"
    else
        # Remove existing Docker
        sudo apt remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
        sudo rm -rf /etc/apt/keyrings/docker.gpg
        sudo rm -f /etc/apt/sources.list.d/docker.list
        
        # Install Docker
        sudo install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg || error "Failed to add Docker GPG key"
        sudo chmod a+r /etc/apt/keyrings/docker.gpg

        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

        sudo apt update
        sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || error "Failed to install Docker"
    fi
else
    sudo install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg || error "Failed to add Docker GPG key"
    sudo chmod a+r /etc/apt/keyrings/docker.gpg

    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

    sudo apt update
    sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin || error "Failed to install Docker"
fi

# Add user to docker group
if ! groups | grep -q docker; then
    sudo usermod -aG docker "$USER" || error "Failed to add user to docker group"
    success "Added $USER to docker group"
    warning "You must log out and back in (or run 'newgrp docker') to use Docker without sudo"
else
    log "User already in docker group"
fi

# Verify Docker installation
if ! command -v docker &> /dev/null; then
    error "Docker installation failed"
fi
DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
DOCKER_COMPOSE_VERSION=$(docker compose version | cut -d' ' -f4)
success "Docker $DOCKER_VERSION installed"
success "Docker Compose $DOCKER_COMPOSE_VERSION installed"

# Step 5: Install Xvfb and browser dependencies
log "[5/6] Installing Xvfb and Chromium dependencies..."
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
  xdg-utils || error "Failed to install Xvfb and browser dependencies"

# Verify Xvfb and Chromium
if ! command -v Xvfb &> /dev/null; then
    error "Xvfb installation failed"
fi
if ! command -v chromium-browser &> /dev/null; then
    error "Chromium installation failed"
fi
success "Xvfb installed"
success "Chromium installed"

# Step 6: Install build tools
log "[6/6] Installing build tools..."
if ! command -v make &> /dev/null || ! command -v gcc &> /dev/null; then
    sudo apt install -y build-essential python3 git || error "Failed to install build tools"
    success "Build tools installed"
else
    log "Build tools already installed"
fi

# Verify build tools
if ! command -v make &> /dev/null || ! command -v gcc &> /dev/null || ! command -v python3 &> /dev/null; then
    error "Build tools installation failed"
fi

# Final summary
echo ""
echo "=========================================="
echo "  Installation Complete!"
echo "=========================================="
echo ""
log "Installed components:"
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
log "Setup complete! Log file saved to: $LOG_FILE"

