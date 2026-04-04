import { resolve } from "node:path";
import { GraphAnalyzer } from "../graph/GraphAnalyzer.js";

export const analyzerCache = new Map<string, GraphAnalyzer>();

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

export function clearAnalyzerCache(directory?: string): void {
  if (directory) {
    analyzerCache.delete(normalizeCacheKey(directory));
  } else {
    analyzerCache.clear();
  }
}
