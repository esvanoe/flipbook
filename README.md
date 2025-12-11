# BitM-NG

Modern Browser-in-the-Middle (BitM) tool built with TypeScript, Fastify, and Puppeteer.

## Features

- 🎥 WebRTC-based screen streaming
- 🖱️ Real-time input forwarding
- 🔐 Credential extraction
- ⌨️ Keylogging
- 🎛️ Admin dashboard
- 🐳 Docker support

## Prerequisites

- Node.js 20+ LTS
- Docker and Docker Compose (optional)
- Xvfb (for headless browser rendering)

See [setup.md](./setup.md) for detailed installation instructions.

## Quick Start

### Development

1. Install dependencies:
```bash
npm install
```

2. Copy environment file:
```bash
cp env.example .env
```

3. Edit `.env` and set required values (especially `ADMIN_SOCKET_KEY` and `JWT_SECRET`)

4. Start development server:
```bash
npm run dev
```

### Production

1. Build the project:
```bash
npm run build
```

2. Start the server:
```bash
npm start
```

### Docker

```bash
cd docker
docker compose up -d
```

### Reverse Proxy Setup (Caddy)

For production deployments with automatic TLS:

```bash
sudo ./scripts/setup-reverse-proxy.sh <your-domain.com>
```

This will:
- Install Caddy (if not already installed)
- Create a Caddyfile with automatic TLS
- Configure reverse proxy to forward traffic to the app (port 58082)
- Enable WebSocket support for Socket.IO
- Set up automatic certificate renewal

The reverse proxy will handle:
- HTTPS termination
- WebSocket upgrades for Socket.IO
- Static file serving (if needed)

## Configuration

Configuration is managed through:
- Environment variables (`.env` file)
- `config/turn-servers-exported.json` (for STUN/TURN servers)

See `env.example` for all available configuration options.

## Testing

Run unit tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

Run tests with coverage:
```bash
npm run test:coverage
```

Run tests with UI:
```bash
npm run test:ui
```

**Current Test Coverage:**
- ✅ SessionManager (30 tests)
- ✅ Configuration loading
- ✅ BrowserPoolManager (basic tests)

## Project Structure

```
src/
├── server/           # Backend server code
│   ├── config/       # Configuration management
│   ├── database/     # Database schema and models
│   ├── http/         # HTTP routes
│   ├── websocket/    # Socket.IO handlers
│   ├── services/     # Core services
│   └── utils/        # Utilities
├── client/           # Frontend applications
└── shared/           # Shared types and constants
```

## Development Roadmap

See [build_readme.md](./build_readme.md) for the complete development plan.

**Current Phase:** Phase 4 - Frontend (Victim Page) ✅

**Completed:**
- ✅ Phase 1: Foundation (Project setup, server, config, Docker)
- ✅ Phase 2: Core Services (SessionManager, BrowserPoolManager, WebRTC signaling)
- ✅ Phase 3: Input/Output (InputEventRouter, KeyloggerService, CredentialExtractor, WebRTC streaming)
- ✅ Phase 4: Frontend - Victim Page (WebRTC client, input capture, video display, styling)
- ✅ Unit Tests (30 tests passing)

## License

UNLICENSED

