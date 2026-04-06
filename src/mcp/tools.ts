import { resolve } from "node:path";
import * as fs from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import { ProjectParser } from "../parser/ProjectParser.js";
import { GraphBuilder } from "../graph/GraphBuilder.js";
import { GraphAnalyzer } from "../graph/GraphAnalyzer.js";
import { GraphNode, GraphEdge, RankedFile } from "../graph/types.js";
import { ComplexityResult } from "../parser/ComplexityAnalyzer.js";
import { analyzerCache, normalizeCacheKey, clearAnalyzerCache, setLastScannedDirectory, getAnalyzerFromCache, setAnalyzerInCache, getPendingAnalyzer, setPendingAnalyzer } from "./cache.js";

const BLOCKED_PATHS = [
  /^c:\\windows/i,
  /^c:\\program files/i,
  /^c:\\programdata/i,
  /^\/etc\//i,
  /^\/usr\//i,
  /^\/var\//i,
  /^\/system volumes/i,
  /^\/private\//i,
  /^\\\\\?\\/i,
];

function validateDirectory(directory: string): string {
  const absoluteDir = resolve(directory);

  if (BLOCKED_PATHS.some(pattern => pattern.test(absoluteDir))) {
    throw new Error(`Access to system path is not allowed: ${absoluteDir}`);
  }

  if (!fs.existsSync(absoluteDir)) {
    throw new Error(`Directory does not exist: ${absoluteDir}`);
  }

  if (!fs.statSync(absoluteDir).isDirectory()) {
    throw new Error(`Path is not a directory: ${absoluteDir}`);
  }

  return absoluteDir;
}

async function getAnalyzer(directory: string): Promise<GraphAnalyzer> {
  const normalizedDir = normalizeCacheKey(directory);
  const cached = getAnalyzerFromCache(normalizedDir);
  if (cached) {
    return cached;
  }

  const pending = getPendingAnalyzer(normalizedDir);
  if (pending) {
    return pending;
  }

  const analyzerPromise = (async () => {
    const parser = new ProjectParser();
    const parseResult = await parser.parse(directory);
    const builder = new GraphBuilder();
    const { graph, nodes, edges } = builder.build(parseResult);
    const analyzer = new GraphAnalyzer(graph, parseResult, nodes, edges);
    setAnalyzerInCache(normalizedDir, analyzer);
    setLastScannedDirectory(normalizedDir);
    return analyzer;
  })();

  setPendingAnalyzer(normalizedDir, analyzerPromise);
  return analyzerPromise;
}

/**
 * Wraps MCP tool handlers to catch errors and return structured error responses.
 * Ensures all tool responses have consistent format regardless of success/failure.
 */
function getErrorMessage(error: Error): { message: string; errorCode: string } {
  const msg = error.message;

  if (msg.includes("does not exist")) {
    return {
      message: `${msg}. Please check that the path is correct and try again.`,
      errorCode: "ERR_DIRECTORY_NOT_FOUND",
    };
  }

  if (msg.includes("Too many files")) {
    return {
      message: `${msg}. Try scanning a subdirectory to reduce the file count.`,
      errorCode: "ERR_TOO_MANY_FILES",
    };
  }

  if (msg.includes("Path is not a directory")) {
    return {
      message: `${msg}. Please provide a directory path, not a file path.`,
      errorCode: "ERR_NOT_A_DIRECTORY",
    };
  }

  if (msg.includes("no TypeScript files") || msg.includes("No files found") || msg.includes("no files found")) {
    return {
      message: `${msg}. Ensure the directory contains TypeScript files and try again.`,
      errorCode: "ERR_NO_FILES_FOUND",
    };
  }

  if (msg.includes("Invalid regex pattern")) {
    return {
      message: `${msg}. Regex patterns must be valid JavaScript regular expressions.`,
      errorCode: "ERR_INVALID_REGEX",
    };
  }

  return {
    message: msg,
    errorCode: "ERR_UNKNOWN",
  };
}

async function safeHandler(fn: () => Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}>): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}> {
  try {
    return await fn();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const result = getErrorMessage(error instanceof Error ? error : new Error(message));
    return {
      content: [{ type: "text", text: `Error: ${result.message}` }],
      structuredContent: { errorCode: result.errorCode, message: result.message },
      isError: true,
    };
  }
}

export { validateDirectory, getAnalyzer, safeHandler, clearAnalyzerCache };

export function registerTools(server: McpServer): void {
  // Tool 1: scan_codebase
  server.registerTool(
    "scan_codebase",
    {
      title: "Scan Codebase",
      description: "Scan a directory and return a summary of all files, functions, classes, and their relationships. Use this first before any other analysis.",
      inputSchema: z.object({
        directory: z.string().min(1).describe("Path to the directory to scan (relative or absolute)"),
      }),
      outputSchema: z.object({
        directory: z.string(),
        totalFiles: z.number(),
        totalFunctions: z.number(),
        totalClasses: z.number(),
        totalImports: z.number(),
        totalExports: z.number(),
        files: z.array(z.object({
          relativePath: z.string(),
          functionCount: z.number(),
          classCount: z.number(),
          importCount: z.number(),
          exportCount: z.number(),
          totalLines: z.number(),
        })),
      }),
    },
    async ({ directory }) => {
      return await safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const analyzer = await getAnalyzer(validatedDir);
        const parseResult = analyzer.getParseResult();

        const output = {
          directory: parseResult.directory,
          totalFiles: parseResult.totalFiles,
          totalFunctions: parseResult.totalFunctions,
          totalClasses: parseResult.totalClasses,
          totalImports: parseResult.totalImports,
          totalExports: parseResult.totalExports,
          files: parseResult.files.map(f => ({
            relativePath: f.relativePath,
            functionCount: f.functions.length,
            classCount: f.classes.length,
            importCount: f.imports.length,
            exportCount: f.exports.length,
            totalLines: f.totalLines,
          })),
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      });
    }
  );

  // Tool 2: find_function
  server.registerTool(
    "find_function",
    {
      title: "Find Function or Class",
      description: "Search for a function or class by name across the codebase. Returns location, signature, callers, and callees. When useRegex is true, the name is treated as a case-insensitive regex pattern.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Name of the function or class to search for"),
        directory: z.string().describe("Path to the codebase directory (must be scanned first)"),
        type: z.enum(["function", "class", "any"]).default("any").describe("Type of symbol to search for"),
        useRegex: z.boolean().default(false).describe("Whether to treat name as a regex pattern (case-insensitive)"),
      }),
      outputSchema: z.object({
        matches: z.array(z.object({
          name: z.string(),
          filePath: z.string(),
          relativePath: z.string(),
          lineNumber: z.number(),
          kind: z.string(),
          parameters: z.array(z.string()),
          returnType: z.string(),
          isExported: z.boolean(),
        })),
        callers: z.array(z.string()),
        callees: z.array(z.string()),
        totalMatches: z.number(),
      }),
    },
    async ({ name, directory, type, useRegex }) => {
      return await safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const analyzer = await getAnalyzer(validatedDir);
        const matches = analyzer.findFunction(name, type, useRegex);

        const callers: string[] = [];
        const callees: string[] = [];

        for (const match of matches) {
          const nodeId = match.kind === "class"
            ? `class:${match.filePath}:${match.name}:${match.lineNumber}`
            : `fn:${match.filePath}:${match.name}:${match.lineNumber}`;
          const directCallers = analyzer.getCallers(nodeId);
          const directCallees = analyzer.getCallees(nodeId);
          if (directCallers.length > 0 || directCallees.length > 0) {
            callers.push(...directCallers);
            callees.push(...directCallees);
          } else {
            const fileId = `file:${match.filePath}`;
            const fileCallers = analyzer.getCallers(fileId);
            const fileCallees = analyzer.getCallees(fileId);
            callers.push(...fileCallers.map((c: string) => `${c} (file-level)`));
            callees.push(...fileCallees.map((c: string) => `${c} (file-level)`));
          }
        }

        const output = {
          matches,
          callers: [...new Set(callers)],
          callees: [...new Set(callees)],
          totalMatches: matches.length,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      });
    }
  );

  // Tool 3: analyze_dependencies
  server.registerTool(
    "analyze_dependencies",
    {
      title: "Analyze Dependencies",
      description: "Returns the dependency graph between files. Can return the full graph or a subgraph for a specific file. Supports JSON, Mermaid, DOT, and PlantUML output formats.",
      inputSchema: z.object({
        directory: z.string().min(1).describe("Path to the codebase directory (must be scanned first)"),
        targetFile: z.string().optional().describe("Optional: filter to show only nodes related to this file"),
        format: z.enum(["json", "mermaid", "dot", "plantuml"]).default("json").describe("Output format: json for data, mermaid/dot/plantuml for visual diagram"),
      }),
      outputSchema: z.object({
        format: z.string(),
        nodeCount: z.number(),
        edgeCount: z.number(),
        nodes: z.array(z.object({
          id: z.string(),
          kind: z.string(),
          label: z.string(),
          filePath: z.string(),
        })),
        edges: z.array(z.object({
          source: z.string(),
          target: z.string(),
          kind: z.string(),
          label: z.string(),
        })),
        cycles: z.array(z.array(z.string())),
        mermaid: z.string().optional(),
        dot: z.string().optional(),
        plantuml: z.string().optional(),
      }),
    },
    async ({ directory, targetFile, format }) => {
      return await safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const analyzer = await getAnalyzer(validatedDir);
        let nodes = analyzer.getNodes();
        let edges = analyzer.getEdges();
        let cycles: string[][] = [];

        if (targetFile) {
          const sanitizedTarget = targetFile
            .replace(/[\/\\]/g, "")
            .replace(/\.\./g, ".")
            .slice(0, 200);
          const matchingNodes = nodes.filter((n: GraphNode) => n.filePath.includes(targetFile) || n.label.includes(targetFile));
          const matchingIds = new Set(matchingNodes.map((n: GraphNode) => n.id));
          const expandedIds = new Set<string>(matchingIds);
          for (const nodeId of matchingIds) {
            for (const neighbor of analyzer.getGraph().inNeighbors(nodeId)) {
              expandedIds.add(neighbor);
            }
            for (const neighbor of analyzer.getGraph().outNeighbors(nodeId)) {
              expandedIds.add(neighbor);
            }
          }
          const expandedNodeSet = new Set(expandedIds);
          nodes = nodes.filter((n: GraphNode) => expandedNodeSet.has(n.id));
          edges = edges.filter((e: GraphEdge) => expandedNodeSet.has(e.source) && expandedNodeSet.has(e.target));
          cycles = [];
        } else {
          cycles = analyzer.detectCycles();
        }

         const output: {
           format: "json" | "mermaid" | "dot" | "plantuml";
           nodeCount: number;
           edgeCount: number;
           nodes: { id: string; kind: string; label: string; filePath: string }[];
           edges: { source: string; target: string; kind: string; label: string }[];
           cycles: string[][];
           mermaid?: string;
           dot?: string;
           plantuml?: string;
         } = {
           format,
           nodeCount: nodes.length,
           edgeCount: edges.length,
           nodes: nodes.map((n: GraphNode) => ({ id: n.id, kind: n.kind, label: n.label, filePath: n.filePath })),
           edges: edges.map((e: GraphEdge) => ({ source: e.source, target: e.target, kind: e.kind, label: e.label })),
           cycles,
         };

        if (format === "mermaid") {
          output.mermaid = analyzer.toMermaid(targetFile);
        } else if (format === "dot") {
          output.dot = analyzer.toDot(targetFile);
        } else if (format === "plantuml") {
          output.plantuml = analyzer.toPlantUML(targetFile);
        }

         return {
           content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
           structuredContent: output,
         };
      });
    }
  );

  // Tool 4: rank_impact
  server.registerTool(
    "rank_impact",
    {
      title: "Rank Impact",
      description: "Ranks files by centrality to identify the most important/central files in the codebase. Use this to answer questions like 'Where should I add a new feature?' or 'Which files are most critical?'",
      inputSchema: z.object({
        directory: z.string().min(1).describe("Path to the codebase directory (must be scanned first)"),
        metric: z.enum(["inDegree", "outDegree", "betweenness", "pagerank"]).default("inDegree").describe("Centrality metric: inDegree (most depended upon), outDegree (most dependencies), betweenness (most on critical paths), pagerank (most influential based on random walk)"),
        topN: z.number().min(1).default(10).describe("Number of top results to return"),
      }),
       outputSchema: z.object({
         metric: z.string(),
         ranked: z.array(z.object({
           relativePath: z.string(),
           score: z.number(),
           functionCount: z.number(),
           classCount: z.number(),
           importCount: z.number(),
           exportCount: z.number(),
         })),
         recommendations: z.array(z.string()),
       }),
    },
    async ({ directory, metric, topN }) => {
      return await safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const analyzer = await getAnalyzer(validatedDir);
        const ranked = analyzer.rankImpact(metric);
        const top = ranked.slice(0, topN);

        const recommendations: string[] = [];
        if (top.length > 0) {
          recommendations.push(`Most central file: ${top[0].relativePath} (score: ${top[0].score})`);
          recommendations.push("This file is the most depended-upon module. Changes here will have the widest impact.");
          if (top.length > 1) {
            recommendations.push(`Second most central: ${top[1].relativePath} (score: ${top[1].score})`);
          }
          const leafNodes = ranked.filter((r: RankedFile) => r.score === 0).slice(0, 3);
          if (leafNodes.length > 0) {
            recommendations.push(`Leaf files (no dependents): ${leafNodes.map((l: RankedFile) => l.relativePath).join(", ")}`);
          }
        }

        const output = {
          metric,
          ranked: top.map((r: RankedFile) => ({
            relativePath: r.relativePath,
            score: r.score,
            metric: r.metric,
            functionCount: r.functionCount,
            classCount: r.classCount,
            importCount: r.importCount,
            exportCount: r.exportCount,
          })),
          recommendations,
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      });
    }
  );

  // Tool 5: trace_call_chain
  server.registerTool(
    "trace_call_chain",
    {
      title: "Trace Call Chain",
      description: "Traces the call chain / dependency path from one function or file to another. Shows the full path through the codebase.",
      inputSchema: z.object({
        from: z.string().min(1).describe("Starting function, class, or file name"),
        to: z.string().min(1).describe("Target function, class, or file name"),
        directory: z.string().min(1).describe("Path to the codebase directory (must be scanned first)"),
      }),
      outputSchema: z.object({
        found: z.boolean(),
        from: z.string(),
        to: z.string(),
        paths: z.array(z.array(z.string())),
        pathCount: z.number(),
      }),
    },
    async ({ from, to, directory }) => {
      return await safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const analyzer = await getAnalyzer(validatedDir);
        const result = analyzer.traceCallChain(from, to);

        const output = {
          found: result.found,
          from,
          to,
          paths: result.paths,
          pathCount: result.paths.length,
        };

        return {
          content: [{
            type: "text",
            text: result.found
              ? `Found ${result.paths.length} path(s) from "${from}" to "${to}":\n${JSON.stringify(result.paths, null, 2)}`
              : `No path found from "${from}" to "${to}". These symbols may not be connected in the dependency graph.`,
          }],
          structuredContent: output,
        };
      });
    }
  );

  // Tool 6: analyze_complexity
  server.registerTool(
    "analyze_complexity",
    {
      title: "Analyze Code Complexity",
      description: "Analyze code complexity metrics for each file in the codebase. Identifies files that may need refactoring based on cyclomatic complexity, cognitive complexity, nesting depth, and size.",
      inputSchema: z.object({
        directory: z.string().min(1).describe("Path to the codebase directory (must be scanned first)"),
        threshold: z.number().optional().describe("Minimum complexity score to report (0-100)"),
        topN: z.number().min(1).default(10).describe("Number of most complex files to return"),
      }),
      outputSchema: z.object({
        totalFiles: z.number(),
        files: z.array(z.object({
          relativePath: z.string(),
          cyclomaticComplexity: z.number(),
          cognitiveComplexity: z.number(),
          nestingDepth: z.number(),
          linesOfCode: z.number(),
          functionCount: z.number(),
          classCount: z.number(),
          overallScore: z.number(),
          issues: z.array(z.string()),
        })),
        summary: z.object({
          avgComplexity: z.number(),
          maxComplexity: z.number(),
          filesNeedingRefactoring: z.number(),
        }),
      }),
    },
    async ({ directory, threshold, topN }) => {
      return await safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const parser = new ProjectParser();
        const parseResult = await parser.parse(validatedDir);

        const results: ComplexityResult[] = parseResult.files.map((fileInfo) => {
          const cyclomaticComplexity = calculateCyclomaticComplexityFromBodies(fileInfo.functions);
          const cognitiveComplexity = calculateCognitiveComplexityFromBodies(fileInfo.functions);
          const nestingDepth = calculateNestingDepthFromBodies(fileInfo.functions);
          const linesOfCode = fileInfo.totalLines;
          const functionCount = fileInfo.functions.length;
          const classCount = fileInfo.classes.length;

          const issues = identifyComplexityIssues({
            cyclomaticComplexity,
            cognitiveComplexity,
            nestingDepth,
            linesOfCode,
            functionCount,
            classCount,
          });

          const overallScore = calculateComplexityScore({
            cyclomaticComplexity,
            cognitiveComplexity,
            nestingDepth,
            linesOfCode,
            functionCount,
            classCount,
          });

          return {
            filePath: fileInfo.filePath,
            relativePath: fileInfo.relativePath,
            cyclomaticComplexity,
            cognitiveComplexity,
            nestingDepth,
            linesOfCode,
            functionCount,
            classCount,
            overallScore,
            issues,
          };
        });

        const filteredResults = threshold
          ? results.filter(r => r.overallScore >= threshold)
          : results;

        const sortedResults = filteredResults
          .sort((a, b) => b.overallScore - a.overallScore)
          .slice(0, topN);

        const avgComplexity = results.length > 0
          ? Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length)
          : 0;

        const maxComplexity = results.length > 0
          ? Math.max(...results.map(r => r.overallScore))
          : 0;

        const filesNeedingRefactoring = results.filter(r => r.overallScore >= 50).length;

        const output = {
          totalFiles: results.length,
          files: sortedResults.map(r => ({
            relativePath: r.relativePath,
            cyclomaticComplexity: r.cyclomaticComplexity,
            cognitiveComplexity: r.cognitiveComplexity,
            nestingDepth: r.nestingDepth,
            linesOfCode: r.linesOfCode,
            functionCount: r.functionCount,
            classCount: r.classCount,
            overallScore: r.overallScore,
            issues: r.issues,
          })),
          summary: {
            avgComplexity,
            maxComplexity,
            filesNeedingRefactoring,
          },
        };

        return {
          content: [{ type: "text", text: JSON.stringify(output, null, 2) }],
          structuredContent: output,
        };
      });
    }
  );

  function calculateCyclomaticComplexityFromBodies(functions: { body: string }[]): number {
    let complexity = 1;
    for (const fn of functions) {
      const body = fn.body;
      const keywords = ['if ', 'for ', 'while ', 'switch ', 'catch ', '&&', '||', '? '];
      for (const kw of keywords) {
        const count = (body.match(new RegExp(kw.replace(' ', '\\b'), 'g')) || []).length;
        complexity += count;
      }
    }
    return complexity;
  }

  function calculateCognitiveComplexityFromBodies(functions: { body: string }[]): number {
    let complexity = 0;
    let nestingLevel = 0;
    for (const fn of functions) {
      const body = fn.body;
      let i = 0;
      while (i < body.length) {
        const char = body[i];
        if (char === '{') {
          nestingLevel++;
        } else if (char === '}') {
          nestingLevel = Math.max(0, nestingLevel - 1);
        }
        const remaining = body.slice(i);
        if (remaining.startsWith('if ') || remaining.startsWith('for ') ||
            remaining.startsWith('while ') || remaining.startsWith('switch ') ||
            remaining.startsWith('catch ') || remaining.startsWith('try ')) {
          complexity++;
          complexity += nestingLevel;
        }
        i++;
      }
    }
    return complexity;
  }

  function calculateNestingDepthFromBodies(functions: { body: string }[]): number {
    let maxNesting = 0;
    let currentNesting = 0;
    for (const fn of functions) {
      for (const char of fn.body) {
        if (char === '{') {
          currentNesting++;
          maxNesting = Math.max(maxNesting, currentNesting);
        } else if (char === '}') {
          currentNesting = Math.max(0, currentNesting - 1);
        }
      }
    }
    return maxNesting;
  }

  function identifyComplexityIssues(metrics: {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    nestingDepth: number;
    linesOfCode: number;
    functionCount: number;
    classCount: number;
  }): string[] {
    const issues: string[] = [];
    if (metrics.cyclomaticComplexity > 10) {
      issues.push(`Cyclomatic complexity (${metrics.cyclomaticComplexity}) exceeds threshold of 10`);
    }
    if (metrics.cognitiveComplexity > 15) {
      issues.push(`Cognitive complexity (${metrics.cognitiveComplexity}) exceeds threshold of 15`);
    }
    if (metrics.nestingDepth > 4) {
      issues.push(`Nesting depth (${metrics.nestingDepth}) exceeds threshold of 4`);
    }
    if (metrics.linesOfCode > 500) {
      issues.push(`Lines of code (${metrics.linesOfCode}) exceeds 500 - file is large`);
    }
    if (metrics.functionCount > 20) {
      issues.push(`Function count (${metrics.functionCount}) exceeds 20 - too many functions`);
    }
    if (metrics.classCount > 10) {
      issues.push(`Class count (${metrics.classCount}) exceeds 10 - too many classes`);
    }
    return issues;
  }

  function calculateComplexityScore(metrics: {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    nestingDepth: number;
    linesOfCode: number;
    functionCount: number;
    classCount: number;
  }): number {
    let score = 0;
    score += Math.min(metrics.cyclomaticComplexity * 4, 25);
    score += Math.min(metrics.cognitiveComplexity * 3, 25);
    score += Math.min(metrics.nestingDepth * 5, 25);
    score += Math.min((metrics.linesOfCode / 500) * 15, 15);
    score += Math.min((metrics.functionCount / 20) * 5, 5);
    score += Math.min((metrics.classCount / 10) * 5, 5);
    return Math.min(Math.round(score), 100);
  }
}
