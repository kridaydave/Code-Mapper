import { Project } from "ts-morph";
import { resolve, join } from "node:path";
import * as fs from "node:fs";
import { FileInfo, ParseResult } from "./types.js";
import { FileAnalyzer } from "./FileAnalyzer.js";

const IGNORE_PATTERNS = [
  /node_modules/,
  /dist/,
  /build/,
  /\.git/,
  /coverage/,
  /\.next/,
  /\.nuxt/,
  /\.svelte-kit/,
  /__tests__/,
  /\.cache/,
  /^\.env$/,
  /credentials\.json/,
  /^secrets\./,
];

const MAX_FILES = 10000;

export interface ProgressInfo {
  phase: "scanning" | "parsing" | "analyzing";
  current: number;
  total: number;
  currentFile?: string;
  percentComplete: number;
}

export type ProgressCallback = (progress: ProgressInfo) => void;

export interface ParseOptions {
  directory: string;
  onProgress?: ProgressCallback;
  maxFiles?: number;
}

export class ProjectParser {
  private project: Project;
  private cache: Map<string, ParseResult> = new Map();

  constructor() {
    this.project = new Project({
      skipAddingFilesFromTsConfig: true,
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        noEmit: true,
      },
    });
  }

  /**
   * @param directory - The absolute path to the project directory to parse.
   * @param options - Optional configuration options including progress callback and max file count.
   */
  async parse(directory: string, options?: ParseOptions): Promise<ParseResult> {
    const absoluteDir = resolve(directory);
    const onProgress = options?.onProgress;
    const maxFiles = options?.maxFiles ?? MAX_FILES;

    const sourceFiles = this.project.getSourceFiles();
    for (const sf of sourceFiles) {
      this.project.removeSourceFile(sf);
    }

    if (!fs.existsSync(absoluteDir)) {
      throw new Error(`Directory does not exist: ${absoluteDir}`);
    }
    if (!fs.statSync(absoluteDir).isDirectory()) {
      throw new Error(`Path is not a directory: ${absoluteDir}`);
    }

    if (this.cache.has(absoluteDir)) {
      return this.cache.get(absoluteDir)!;
    }

    if (onProgress) {
      onProgress({ phase: "scanning", current: 0, total: 0, percentComplete: 0 });
    }

    const files = this.findFiles(absoluteDir);

    if (files.length > maxFiles) {
      throw new Error(`Too many files (${files.length}). Maximum allowed: ${maxFiles}. Consider scanning a subdirectory.`);
    }

    if (files.length === 0) {
      const empty: ParseResult = {
        directory: absoluteDir,
        files: [],
        totalFiles: 0,
        totalFunctions: 0,
        totalClasses: 0,
        totalImports: 0,
        totalExports: 0,
      };
      return empty;
    }

    this.project.addSourceFilesAtPaths(files);

    const analyzer = new FileAnalyzer(this.project, absoluteDir);

    const fileInfos: FileInfo[] = [];
    const total = files.length;
    for (let i = 0; i < this.project.getSourceFiles().length; i++) {
      const sourceFile = this.project.getSourceFiles()[i];
      fileInfos.push(analyzer.analyze(sourceFile));

      if (onProgress) {
        const currentFile = sourceFile.getFilePath();
        onProgress({
          phase: "parsing",
          current: i + 1,
          total,
          currentFile,
          percentComplete: Math.round(((i + 1) / total) * 100),
        });
      }
    }

    const result: ParseResult = {
      directory: absoluteDir,
      files: fileInfos,
      totalFiles: fileInfos.length,
      totalFunctions: fileInfos.reduce((sum, f) => sum + f.functions.length, 0),
      totalClasses: fileInfos.reduce((sum, f) => sum + f.classes.length, 0),
      totalImports: fileInfos.reduce((sum, f) => sum + f.imports.length, 0),
      totalExports: fileInfos.reduce((sum, f) => sum + f.exports.length, 0),
    };

    if (onProgress) {
      onProgress({ phase: "analyzing", current: total, total, percentComplete: 100 });
    }

    this.cache.set(absoluteDir, result);
    return result;
  }

  clearCache(directory?: string): void {
    if (directory) {
      this.cache.delete(resolve(directory));
    } else {
      this.cache.clear();
    }
  }

  private findFiles(directory: string): string[] {
    const results: string[] = [];

    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!IGNORE_PATTERNS.some(pattern => pattern.test(fullPath))) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (/\.(ts|tsx|js|jsx|mts|mjs|mcts|cjs|cts)$/i.test(entry.name)) {
            results.push(fullPath);
          }
        }
      }
    };

    walk(directory);
    return results;
  }
}
