import { z } from 'zod';
import { readFileSync } from 'fs';
import { join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// STUN/TURN Server Configuration Schema
const IceServerSchema = z.object({
  urls: z.string(),
  username: z.string().optional(),
  credential: z.string().optional(),
});

const WebRTCConfigSchema = z.object({
  stunServers: z.array(IceServerSchema),
  turnServers: z.array(IceServerSchema).optional(),
});

// Main Configuration Schema
const ConfigSchema = z.object({
  server: z.object({
    port: z.number().default(58082),
    host: z.string().default('0.0.0.0'),
    bodyLimit: z.number().default(19922944),
  }),
  admin: z.object({
    allowedIps: z.array(z.string()),
    socketKey: z.string().min(32),
    jwtSecret: z.string().min(32),
  }),
  browser: z.object({
    maxInstances: z.number().default(10),
    minPoolSize: z.number().default(2),
    idleTimeout: z.number().default(300000), // 5 minutes
    userDataBasePath: z.string().default('./user_data'),
    defaultUserAgent: z.string().default(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ),
    proxy: z.string().nullable().default(null),
    defaultTargetUrl: z.string().url().default('https://example.com'),
  }),
  webrtc: WebRTCConfigSchema,
  logging: z.object({
    level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
    format: z.enum(['json', 'simple']).default('json'),
    file: z.string().optional(),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;
export type WebRTCConfig = z.infer<typeof WebRTCConfigSchema>;

/**
 * Load STUN/TURN configuration from exported JSON file
 */
function loadWebRTCConfig(): WebRTCConfig {
  try {
    const configPath = join(process.cwd(), 'config', 'turn-servers-exported.json');
    const configData = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(configData);
    
    // Validate the structure
    return WebRTCConfigSchema.parse(parsed.webrtc);
  } catch (error) {
    console.warn('Failed to load STUN/TURN config from file, using defaults:', error);
    // Fallback to default STUN servers
    return {
      stunServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    };
  }
}

/**
 * Load configuration from environment variables and files
 */
function loadConfig(): Config {
  const webrtcConfig = loadWebRTCConfig();

  // Parse allowed IPs from environment (comma-separated)
  const allowedIps = process.env.ADMIN_ALLOWED_IPS
    ? process.env.ADMIN_ALLOWED_IPS.split(',').map((ip) => ip.trim())
    : [];

  const config: Config = {
    server: {
      port: parseInt(process.env.SERVER_PORT || '58082', 10),
      host: process.env.SERVER_HOST || '0.0.0.0',
      bodyLimit: parseInt(process.env.SERVER_BODY_LIMIT || '19922944', 10),
    },
    admin: {
      allowedIps,
      socketKey: process.env.ADMIN_SOCKET_KEY || '',
      jwtSecret: process.env.JWT_SECRET || '',
    },
    browser: {
      maxInstances: parseInt(process.env.BROWSER_MAX_INSTANCES || '10', 10),
      minPoolSize: parseInt(process.env.BROWSER_MIN_POOL_SIZE || '2', 10),
      idleTimeout: parseInt(process.env.BROWSER_IDLE_TIMEOUT || '300000', 10),
      userDataBasePath: process.env.BROWSER_USER_DATA_PATH || './user_data',
      defaultUserAgent:
        process.env.BROWSER_USER_AGENT ||
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      proxy: process.env.BROWSER_PROXY || null,
      defaultTargetUrl: process.env.BROWSER_DEFAULT_TARGET_URL || 'https://example.com',
    },
    webrtc: webrtcConfig,
    logging: {
      level: (process.env.LOG_LEVEL as 'error' | 'warn' | 'info' | 'debug') || 'info',
      format: (process.env.LOG_FORMAT as 'json' | 'simple') || 'json',
      file: process.env.LOG_FILE,
    },
  };

  // Validate configuration
  return ConfigSchema.parse(config);
}

// Export singleton config instance
export const config = loadConfig();

