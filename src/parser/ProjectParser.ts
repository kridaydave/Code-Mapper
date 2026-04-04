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
];

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

  async parse(directory: string): Promise<ParseResult> {
    const absoluteDir = resolve(directory);

    if (!fs.existsSync(absoluteDir)) {
      throw new Error(`Directory does not exist: ${absoluteDir}`);
    }
    if (!fs.statSync(absoluteDir).isDirectory()) {
      throw new Error(`Path is not a directory: ${absoluteDir}`);
    }

    if (this.cache.has(absoluteDir)) {
      return this.cache.get(absoluteDir)!;
    }

    const files = this.findFiles(absoluteDir);

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
      this.cache.set(absoluteDir, empty);
      return empty;
    }

    const sourceFiles = this.project.getSourceFiles();
    for (const sf of sourceFiles) {
      this.project.removeSourceFile(sf);
    }
    this.project.addSourceFilesAtPaths(files);

    const analyzer = new FileAnalyzer(this.project, absoluteDir);

    const fileInfos: FileInfo[] = [];
    for (const sourceFile of this.project.getSourceFiles()) {
      fileInfos.push(analyzer.analyze(sourceFile));
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
          if (!IGNORE_PATTERNS.some(pattern => pattern.test(entry.name))) {
            walk(fullPath);
          }
        } else if (entry.isFile()) {
          if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            results.push(fullPath);
          }
        }
      }
    };

    walk(directory);
    return results;
  }
}
