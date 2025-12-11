# Setup Scripts

## setup-platform.sh

Automated installation script for all platform prerequisites.

### Usage

```bash
./setup-platform.sh
```

### What it does

1. Updates system packages
2. Installs Node.js 20.x LTS
3. Installs Docker and Docker Compose
4. Installs Xvfb and Chromium with all dependencies
5. Installs build tools (gcc, make, python3)

### Features

- **Idempotent**: Can be run multiple times safely
- **Error handling**: Exits on errors with clear messages
- **Logging**: Creates timestamped log files in `/tmp/`
- **Validation**: Checks OS version, disk space, and existing installations
- **Interactive prompts**: Asks before reinstalling existing components

### Requirements

- Ubuntu 22.04 (Jammy)
- User with sudo privileges
- Internet connectivity
- At least 2GB free disk space

### Output

The script creates a log file at `/tmp/cuddlephish-setup-YYYYMMDD-HHMMSS.log` with all installation details.

### Post-Installation

After running the script:

1. **Docker Group**: Log out and back in (or run `newgrp docker`) to use Docker without sudo
2. **Verification**: Run the verification commands in `../setup.md`
3. **Next Steps**: Proceed with Phase 1: Foundation setup

