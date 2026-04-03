import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Graph = require("graphology");
import * as shortestPath from "graphology-shortest-path";
import { centrality } from "graphology-metrics";
import { ParseResult } from "../parser/types.js";
import { GraphNode, GraphEdge, RankedFile, FunctionMatch, CallChainResult } from "./types.js";

export class GraphAnalyzer {
  private graph: any;
  private parseResult: ParseResult;
  private nodes: GraphNode[];
  private edges: GraphEdge[];

  constructor(graph: any, parseResult: ParseResult, nodes: GraphNode[], edges: GraphEdge[]) {
    this.graph = graph;
    this.parseResult = parseResult;
    this.nodes = nodes;
    this.edges = edges;
  }

  getGraph(): any {
    return this.graph;
  }

  getNodes(): GraphNode[] {
    return this.nodes;
  }

  getEdges(): GraphEdge[] {
    return this.edges;
  }

  /**
   * Rank files by centrality metric
   */
  rankImpact(metric: "inDegree" | "outDegree" | "betweenness" = "inDegree"): RankedFile[] {
    const fileNodes = this.nodes.filter((n: GraphNode) => n.kind === "file");
    const scores = new Map<string, number>();

    if (metric === "betweenness") {
      const betweenness = centrality.betweenness(this.graph);
      for (const [node, score] of Object.entries(betweenness)) {
        scores.set(node, score as number);
      }
    } else if (metric === "inDegree") {
      for (const node of fileNodes) {
        scores.set(node.id, this.graph.inDegree(node.id));
      }
    } else {
      for (const node of fileNodes) {
        scores.set(node.id, this.graph.outDegree(node.id));
      }
    }

    const ranked: RankedFile[] = fileNodes
      .map((node: GraphNode) => {
        const fileInfo = this.parseResult.files.find((f) => f.filePath === node.filePath)!;
        return {
          filePath: node.filePath,
          relativePath: fileInfo.relativePath,
          score: scores.get(node.id) ?? 0,
          metric,
          functionCount: fileInfo.functions.length,
          classCount: fileInfo.classes.length,
          importCount: fileInfo.imports.length,
        };
      })
      .sort((a, b) => b.score - a.score);

    return ranked;
  }

  /**
   * Find functions or classes by name
   */
  findFunction(name: string, type: "function" | "class" | "any" = "any"): FunctionMatch[] {
    const matches: FunctionMatch[] = [];
    const lowerName = name.toLowerCase();

    for (const node of this.nodes) {
      if (type !== "any" && node.kind !== type) continue;
      if (node.kind === "file") continue;
      if (!node.label.toLowerCase().includes(lowerName)) continue;

      const fileInfo = this.parseResult.files.find((f) => f.filePath === node.filePath);
      if (!fileInfo) continue;

      if (node.kind === "function") {
        const fn = fileInfo.functions.find((f) => f.name === node.label);
        if (fn) {
          matches.push({
            name: fn.name,
            filePath: fn.filePath,
            relativePath: fileInfo.relativePath,
            lineNumber: fn.lineNumber,
            kind: "function",
            parameters: fn.parameters,
            returnType: fn.returnType,
            isExported: fn.isExported,
          });
        }
      } else if (node.kind === "class") {
        const cls = fileInfo.classes.find((c) => c.name === node.label);
        if (cls) {
          matches.push({
            name: cls.name,
            filePath: cls.filePath,
            relativePath: fileInfo.relativePath,
            lineNumber: cls.lineNumber,
            kind: "class",
            parameters: [],
            returnType: cls.name,
            isExported: cls.isExported,
          });
        }
      }
    }

    return matches;
  }

  /**
   * Get callers (files that import this file)
   */
  getCallers(nodeId: string): string[] {
    const callers: string[] = [];
    for (const neighbor of this.graph.inNeighbors(nodeId)) {
      const node = this.nodes.find((n: GraphNode) => n.id === neighbor);
      if (node) {
        callers.push(node.label);
      }
    }
    return callers;
  }

  /**
   * Get callees (files this file imports)
   */
  getCallees(nodeId: string): string[] {
    const callees: string[] = [];
    for (const neighbor of this.graph.outNeighbors(nodeId)) {
      const node = this.nodes.find((n: GraphNode) => n.id === neighbor);
      if (node) {
        callees.push(node.label);
      }
    }
    return callees;
  }

  /**
   * Find shortest paths between two nodes
   */
  traceCallChain(from: string, to: string): CallChainResult {
    // Find matching nodes
    const fromNodes = this.nodes.filter((n: GraphNode) => n.label.toLowerCase().includes(from.toLowerCase()));
    const toNodes = this.nodes.filter((n: GraphNode) => n.label.toLowerCase().includes(to.toLowerCase()));

    if (fromNodes.length === 0 || toNodes.length === 0) {
      return { found: false, paths: [] };
    }

    const paths: string[][] = [];

    for (const fromNode of fromNodes) {
      for (const toNode of toNodes) {
        if (fromNode.id === toNode.id) continue;

        const pathResult = shortestPath.bidirectional(this.graph, fromNode.id, toNode.id);
        if (pathResult && pathResult.length > 0) {
          const pathLabels = pathResult.map((nodeId: string) => {
            const node = this.nodes.find((n: GraphNode) => n.id === nodeId);
            return node ? `${node.kind}:${node.label}` : nodeId;
          });
          paths.push(pathLabels);
        }
      }
    }

    return {
      found: paths.length > 0,
      paths,
    };
  }

  /**
   * Generate a Mermaid graph diagram string
   */
  toMermaid(targetFile?: string): string {
    const lines: string[] = ["graph TD"];

    const nodesToInclude = targetFile
      ? this.nodes.filter((n: GraphNode) => n.filePath.includes(targetFile) || n.label.includes(targetFile))
      : this.nodes;

    const nodeIds = new Set(nodesToInclude.map((n: GraphNode) => n.id));

    // Add nodes
    for (const node of nodesToInclude) {
      const safeId = this.sanitizeId(node.id);
      lines.push(`    ${safeId}["${node.kind}: ${node.label}"]`);
    }

    // Add edges
    for (const edge of this.edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        const sourceId = this.sanitizeId(edge.source);
        const targetId = this.sanitizeId(edge.target);
        lines.push(`    ${sourceId} -->|${edge.kind}| ${targetId}`);
      }
    }

    return lines.join("\n");
  }

  /**
   * Detect cycles in the graph
   */
  detectCycles(): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string) => {
      if (stack.has(node)) {
        const cycleStart = path.indexOf(node);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), node]);
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      stack.add(node);
      path.push(node);

      for (const neighbor of this.graph.outNeighbors(node)) {
        dfs(neighbor);
      }

      stack.delete(node);
      path.pop();
    };

    for (const node of this.nodes) {
      if (!visited.has(node.id)) {
        dfs(node.id);
      }
    }

    return cycles;
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, "_");
  }
}
