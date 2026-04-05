import { resolve } from "node:path";
import { GraphAnalyzer } from "../graph/GraphAnalyzer.js";

interface CacheEntry {
  analyzer: GraphAnalyzer;
  timestamp: number;
}

const MAX_CACHE_SIZE = 10;
const CACHE_TTL_MS = 30 * 60 * 1000;

export const analyzerCache = new Map<string, CacheEntry>();
const pendingAnalyzers = new Map<string, Promise<GraphAnalyzer>>();

let _lastScannedDirectory: string | null = null;

export function setLastScannedDirectory(dir: string): void {
  _lastScannedDirectory = dir;
}

export function getLastScannedDirectory(): string | null {
  return _lastScannedDirectory;
}

export function normalizeCacheKey(directory: string): string {
  return resolve(directory);
}

function evictIfNeeded(): void {
  if (analyzerCache.size >= MAX_CACHE_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of analyzerCache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) {
      analyzerCache.delete(oldestKey);
    }
  }
}

function isEntryExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS;
}

export function getAnalyzerFromCache(directory: string): GraphAnalyzer | undefined {
  const normalizedDir = normalizeCacheKey(directory);
  const entry = analyzerCache.get(normalizedDir);
  if (entry && !isEntryExpired(entry)) {
    return entry.analyzer;
  }
  if (entry) {
    analyzerCache.delete(normalizedDir);
  }
  return undefined;
}

export function setAnalyzerInCache(directory: string, analyzer: GraphAnalyzer): void {
  evictIfNeeded();
  const normalizedDir = normalizeCacheKey(directory);
  analyzerCache.set(normalizedDir, {
    analyzer,
    timestamp: Date.now(),
  });
}

export function getPendingAnalyzer(directory: string): Promise<GraphAnalyzer> | undefined {
  const normalizedDir = normalizeCacheKey(directory);
  return pendingAnalyzers.get(normalizedDir);
}

export function setPendingAnalyzer(directory: string, promise: Promise<GraphAnalyzer>): void {
  const normalizedDir = normalizeCacheKey(directory);
  pendingAnalyzers.set(normalizedDir, promise);
  promise.finally(() => {
    pendingAnalyzers.delete(normalizedDir);
  });
}

export function clearAnalyzerCache(directory?: string): void {
  if (directory) {
    analyzerCache.delete(normalizeCacheKey(directory));
  } else {
    analyzerCache.clear();
  }
}
