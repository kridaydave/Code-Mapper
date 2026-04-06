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

/**
 * Sets the last scanned directory for caching purposes.
 */
export function setLastScannedDirectory(dir: string): void {
  _lastScannedDirectory = dir;
}

/**
 * Gets the last scanned directory.
 */
export function getLastScannedDirectory(): string | null {
  return _lastScannedDirectory;
}

/**
 * Normalizes a directory path to a consistent cache key format.
 */
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

/**
 * Checks if a cache entry has expired based on TTL.
 */
function isEntryExpired(entry: CacheEntry): boolean {
  return Date.now() - entry.timestamp > CACHE_TTL_MS;
}

/**
 * Retrieves a cached GraphAnalyzer for the directory if valid.
 * Returns undefined if not cached or expired.
 */
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

/**
 * Stores a GraphAnalyzer in the cache for the directory.
 * Evicts oldest entry if cache is at capacity limit.
 */
export function setAnalyzerInCache(directory: string, analyzer: GraphAnalyzer): void {
  evictIfNeeded();
  const normalizedDir = normalizeCacheKey(directory);
  analyzerCache.set(normalizedDir, {
    analyzer,
    timestamp: Date.now(),
  });
}

/**
 * Gets a pending analyzer promise for the directory (for deduplication).
 */
export function getPendingAnalyzer(directory: string): Promise<GraphAnalyzer> | undefined {
  const normalizedDir = normalizeCacheKey(directory);
  return pendingAnalyzers.get(normalizedDir);
}

/**
 * Sets a pending analyzer promise for the directory.
 * Automatically cleans up after promise resolves/rejects.
 */
export function setPendingAnalyzer(directory: string, promise: Promise<GraphAnalyzer>): void {
  const normalizedDir = normalizeCacheKey(directory);
  pendingAnalyzers.set(normalizedDir, promise);
  promise.finally(() => {
    pendingAnalyzers.delete(normalizedDir);
  });
}

/**
 * Clears the analyzer cache. If directory is provided, clears only that entry.
 * Otherwise clears all cached analyzers.
 */
export function clearAnalyzerCache(directory?: string): void {
  if (directory) {
    analyzerCache.delete(normalizeCacheKey(directory));
  } else {
    analyzerCache.clear();
  }
}
