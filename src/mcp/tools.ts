import { resolve } from "node:path";
import * as fs from "node:fs";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/server";
import { ProjectParser } from "../parser/ProjectParser.js";
import { GraphBuilder } from "../graph/GraphBuilder.js";
import { GraphAnalyzer } from "../graph/GraphAnalyzer.js";
import { GraphNode, GraphEdge, RankedFile } from "../graph/types.js";
import { analyzerCache, normalizeCacheKey, clearAnalyzerCache, setLastScannedDirectory } from "./cache.js";

const BLOCKED_PATHS = [
  /^c:\\windows/i,
  /^c:\\program files/i,
  /^\/etc\//i,
  /^\/usr\//i,
  /^\/var\//i,
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
  if (analyzerCache.has(normalizedDir)) {
    return analyzerCache.get(normalizedDir)!;
  }

  const parser = new ProjectParser();
  const parseResult = await parser.parse(directory);
  const builder = new GraphBuilder();
  const { graph, nodes, edges } = builder.build(parseResult);
  const analyzer = new GraphAnalyzer(graph, parseResult, nodes, edges);
  analyzerCache.set(normalizedDir, analyzer);
  setLastScannedDirectory(normalizedDir);
  return analyzer;
}

function safeHandler(fn: () => Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
}>): Promise<{
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
}> {
  return fn().then(
    (result) => result,
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  );
}

export function registerTools(server: McpServer): void {
  // Tool 1: scan_codebase
  server.registerTool(
    "scan_codebase",
    {
      title: "Scan Codebase",
      description: "Scan a directory and return a summary of all files, functions, classes, and their relationships. Use this first before any other analysis.",
      inputSchema: z.object({
        directory: z.string().describe("Path to the directory to scan (relative or absolute)"),
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
      return safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const parser = new ProjectParser();
        const parseResult = await parser.parse(validatedDir);
        const builder = new GraphBuilder();
        const { graph, nodes, edges } = builder.build(parseResult);
        const analyzer = new GraphAnalyzer(graph, parseResult, nodes, edges);
        analyzerCache.set(normalizeCacheKey(validatedDir), analyzer);

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
      description: "Search for a function or class by name across the codebase. Returns location, signature, callers, and callees.",
      inputSchema: z.object({
        name: z.string().describe("Name of the function or class to search for (case-insensitive partial match)"),
        directory: z.string().describe("Path to the codebase directory (must be scanned first)"),
        type: z.enum(["function", "class", "any"]).default("any").describe("Type of symbol to search for"),
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
    async ({ name, directory, type }) => {
      return safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const analyzer = await getAnalyzer(validatedDir);
        const matches = analyzer.findFunction(name, type);

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
      description: "Returns the dependency graph between files. Can return the full graph or a subgraph for a specific file. Supports JSON and Mermaid output formats.",
      inputSchema: z.object({
        directory: z.string().describe("Path to the codebase directory (must be scanned first)"),
        targetFile: z.string().optional().describe("Optional: filter to show only nodes related to this file"),
        format: z.enum(["json", "mermaid"]).default("json").describe("Output format: json for data, mermaid for visual diagram"),
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
      }),
    },
    async ({ directory, targetFile, format }) => {
      return safeHandler(async () => {
        const validatedDir = validateDirectory(directory);
        const analyzer = await getAnalyzer(validatedDir);
        let nodes = analyzer.getNodes();
        let edges = analyzer.getEdges();
        let cycles: string[][] = [];

        if (targetFile) {
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
           format: "json" | "mermaid";
           nodeCount: number;
           edgeCount: number;
           nodes: { id: string; kind: string; label: string; filePath: string }[];
           edges: { source: string; target: string; kind: string; label: string }[];
           cycles: string[][];
           mermaid?: string;
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
        directory: z.string().describe("Path to the codebase directory (must be scanned first)"),
        metric: z.enum(["inDegree", "outDegree", "betweenness"]).default("inDegree").describe("Centrality metric: inDegree (most depended upon), outDegree (most dependencies), betweenness (most on critical paths)"),
        topN: z.number().default(10).describe("Number of top results to return"),
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
      return safeHandler(async () => {
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
        from: z.string().describe("Starting function, class, or file name (case-insensitive partial match)"),
        to: z.string().describe("Target function, class, or file name (case-insensitive partial match)"),
        directory: z.string().describe("Path to the codebase directory (must be scanned first)"),
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
      return safeHandler(async () => {
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
}
