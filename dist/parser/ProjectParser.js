import { Project } from "ts-morph";
import { resolve, join } from "node:path";
import * as fs from "node:fs";
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
    project;
    analyzer;
    cache = new Map();
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
    async parse(directory) {
        const absoluteDir = resolve(directory);
        if (this.cache.has(absoluteDir)) {
            return this.cache.get(absoluteDir);
        }
        const files = this.findFiles(absoluteDir);
        if (files.length === 0) {
            const empty = {
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
        this.project.getSourceFiles().forEach(sf => this.project.removeSourceFile(sf));
        this.project.addSourceFilesAtPaths(files);
        this.analyzer = new FileAnalyzer(this.project, absoluteDir);
        const fileInfos = [];
        for (const sourceFile of this.project.getSourceFiles()) {
            fileInfos.push(this.analyzer.analyze(sourceFile));
        }
        const result = {
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
    clearCache(directory) {
        if (directory) {
            this.cache.delete(resolve(directory));
        }
        else {
            this.cache.clear();
        }
    }
    findFiles(directory) {
        const results = [];
        const walk = (dir) => {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (!IGNORE_PATTERNS.some(pattern => pattern.test(entry.name))) {
                        walk(fullPath);
                    }
                }
                else if (entry.isFile()) {
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
//# sourceMappingURL=ProjectParser.js.map