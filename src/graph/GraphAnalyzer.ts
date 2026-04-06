import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Graph: typeof import("graphology").default = require("graphology");
import type { AbstractGraph, Attributes } from "graphology-types";
import * as shortestPath from "graphology-shortest-path";
import { centrality } from "graphology-metrics";
import pagerank from "graphology-metrics/centrality/pagerank";
import { ParseResult } from "../parser/types.js";
import { GraphNode, GraphEdge, RankedFile, FunctionMatch, CallChainResult } from "./types.js";

type CodeGraph = AbstractGraph<Attributes, Attributes, Attributes>;

export type ExportFormat = "json" | "mermaid" | "dot" | "plantuml";

export interface ComplexityResult {
  filePath: string;
  relativePath: string;
  cyclomaticComplexity: number;
  linesOfCode: number;
  functionCount: number;
  classCount: number;
  nestingDepth: number;
  cognitiveComplexity: number;
}

export class GraphAnalyzer {
  private graph: CodeGraph;
  private parseResult: ParseResult;
  private nodes: GraphNode[];
  private edges: GraphEdge[];

  constructor(graph: CodeGraph, parseResult: ParseResult, nodes: GraphNode[], edges: GraphEdge[]) {
    this.graph = graph;
    this.parseResult = parseResult;
    this.nodes = nodes;
    this.edges = edges;
  }

  getGraph(): CodeGraph {
    return this.graph;
  }

  getNodes(): GraphNode[] {
    return this.nodes;
  }

  getEdges(): GraphEdge[] {
    return this.edges;
  }

  getParseResult(): ParseResult {
    return this.parseResult;
  }

  rankImpact(metric: "inDegree" | "outDegree" | "betweenness" | "pagerank" = "inDegree"): RankedFile[] {
    const fileNodes = this.nodes.filter((n: GraphNode) => n.kind === "file");
    const scores = new Map<string, number>();

    if (metric === "betweenness") {
      const nodeCount = this.graph.order;
      if (nodeCount > 200) {
        metric = "inDegree";
      } else {
        const betweenness = centrality.betweenness(this.graph);
        for (const [node, score] of Object.entries(betweenness)) {
          scores.set(node, score as number);
        }
      }
    }

    if (metric === "pagerank") {
      const ranks = pagerank(this.graph);
      for (const [node, score] of Object.entries(ranks)) {
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
      .map((node: GraphNode): RankedFile | null => {
        const fileInfo = this.parseResult.files.find((f) => f.filePath === node.filePath);
        if (!fileInfo) return null;
        return {
          filePath: node.filePath,
          relativePath: fileInfo.relativePath,
          score: scores.get(node.id) ?? 0,
          metric,
          functionCount: fileInfo.functions.length,
          classCount: fileInfo.classes.length,
          importCount: fileInfo.imports.length,
          exportCount: fileInfo.exports.length,
        };
      })
      .filter((r): r is RankedFile => r !== null)
      .sort((a, b) => b.score - a.score);

    return ranked;
  }

  findFunction(name: string, type: "function" | "class" | "any" = "any", useRegex?: boolean): FunctionMatch[] {
    const matches: FunctionMatch[] = [];

    let regex: RegExp | null = null;
    if (useRegex) {
      regex = new RegExp(name, "i");
    }
    const lowerName = name.toLowerCase();

    for (const node of this.nodes) {
      if (type !== "any" && node.kind !== type) continue;
      if (node.kind === "file") continue;

      const nodeLabel = node.label;
      const matchesPattern = regex
        ? regex.test(nodeLabel)
        : nodeLabel.toLowerCase().includes(lowerName);

      if (!matchesPattern) continue;

      const fileInfo = this.parseResult.files.find((f) => f.filePath === node.filePath);
      if (!fileInfo) continue;

      if (node.kind === "function") {
        const fn = fileInfo.functions.find((f) => f.name.toLowerCase() === node.label.toLowerCase());
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
        const cls = fileInfo.classes.find((c) => c.name.toLowerCase() === node.label.toLowerCase());
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

  traceCallChain(from: string, to: string): CallChainResult {
    const fromNodes = this.nodes.filter((n: GraphNode) => n.label.toLowerCase().includes(from.toLowerCase()));
    const toNodes = this.nodes.filter((n: GraphNode) => n.label.toLowerCase().includes(to.toLowerCase()));

    if (fromNodes.length === 0 || toNodes.length === 0) {
      return { found: false, paths: [] };
    }

    const nodeMap = new Map<string, GraphNode>(this.nodes.map(n => [n.id, n]));
    const paths: string[][] = [];

    for (const fromNode of fromNodes) {
      for (const toNode of toNodes) {
        if (fromNode.id === toNode.id) {
          const node = fromNode;
          paths.push([`${node.kind}:${node.label}`]);
          continue;
        }

        const pathResult = shortestPath.bidirectional(this.graph, fromNode.id, toNode.id);
        if (pathResult && pathResult.length > 0) {
          const pathLabels = pathResult.map((nodeId: string) => {
            const node = nodeMap.get(nodeId);
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

  toMermaid(targetFile?: string): string {
    const lines: string[] = ["graph TD"];

    const nodesToInclude = this.filterNodesForTarget(targetFile);

    const nodeIds = new Set(nodesToInclude.map((n: GraphNode) => n.id));

    // Add nodes
    for (const node of nodesToInclude) {
      const safeId = this.sanitizeId(node.id);
      const safeLabel = this.sanitizeMermaidText(`${node.kind}: ${node.label}`);
      lines.push(`    ${safeId}["${safeLabel}"]`);
    }

    // Add edges
    for (const edge of this.edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        const sourceId = this.sanitizeId(edge.source);
        const targetId = this.sanitizeId(edge.target);
        const safeKind = this.sanitizeMermaidText(edge.kind);
        lines.push(`    ${sourceId} -->|${safeKind}| ${targetId}`);
      }
    }

    return lines.join("\n");
  }

  toDot(targetFile?: string): string {
    const lines: string[] = [
      "digraph codegraph {",
      "  rankdir=LR;",
      "  node [fontname=\"Helvetica\"];",
      "  edge [fontname=\"Helvetica\"];",
    ];

    const nodesToInclude = this.filterNodesForTarget(targetFile);

    const nodeIds = new Set(nodesToInclude.map((n: GraphNode) => n.id));

    for (const node of nodesToInclude) {
      const safeId = this.sanitizeId(node.id);
      const safeLabel = this.sanitizeLabel(node.label);
      let shape: string;
      let fillcolor: string;

      switch (node.kind) {
        case "file":
          shape = "box";
          fillcolor = "lightblue";
          break;
        case "function":
          shape = "ellipse";
          fillcolor = "lightgreen";
          break;
        case "class":
          shape = "box3d";
          fillcolor = "lightyellow";
          break;
        default:
          shape = "ellipse";
          fillcolor = "lightgray";
      }

      lines.push(`  "${safeId}" [label="${safeLabel}" shape=${shape} style=filled fillcolor="${fillcolor}"];`);
    }

    for (const edge of this.edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        const sourceId = this.sanitizeId(edge.source);
        const targetId = this.sanitizeId(edge.target);
        let style: string;
        let color: string;

        switch (edge.kind) {
          case "imports":
            style = "solid";
            color = "black";
            break;
          case "contains":
            style = "dotted";
            color = "gray";
            break;
          case "extends":
            style = "dashed";
            color = "blue";
            break;
          case "implements":
            style = "dashed";
            color = "green";
            break;
          default:
            style = "solid";
            color = "black";
        }

        lines.push(`  "${sourceId}" -> "${targetId}" [style=${style} color="${color}"];`);
      }
    }

    lines.push("}");
    return lines.join("\n");
  }

  toPlantUML(targetFile?: string): string {
    const lines: string[] = [
      "@startuml",
      "skinparam linetype ortho",
    ];

    const nodesToInclude = this.filterNodesForTarget(targetFile);

    const nodeIds = new Set(nodesToInclude.map((n: GraphNode) => n.id));

    for (const node of nodesToInclude) {
      const safeId = this.sanitizeId(node.id);
      const safeLabel = this.sanitizeLabel(`${node.kind}: ${node.label}`);

      switch (node.kind) {
        case "file":
          lines.push(`[${safeLabel}] as ${safeId}`);
          break;
        case "function":
          lines.push(`() "${safeLabel}" as ${safeId}`);
          break;
        case "class":
          lines.push(`interface "${safeLabel}" as ${safeId}`);
          break;
        default:
          lines.push(`[${safeLabel}] as ${safeId}`);
      }
    }

    for (const edge of this.edges) {
      if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
        const sourceId = this.sanitizeId(edge.source);
        const targetId = this.sanitizeId(edge.target);
        let arrow: string;

        switch (edge.kind) {
          case "imports":
            arrow = "-->";
            break;
          case "contains":
            arrow = "*--";
            break;
          case "extends":
            arrow = "--|>";
            break;
          case "implements":
            arrow = "..|>";
            break;
          default:
            arrow = "-->";
        }

        lines.push(`${sourceId} ${arrow} ${targetId}`);
      }
    }

    lines.push("@enduml");
    return lines.join("\n");
  }

  detectCycles(maxDepth = 10000): string[][] {
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const stackSet = new Set<string>();

    for (const startNode of this.nodes) {
      if (visited.has(startNode.id)) continue;

      const workStack: Array<{ node: string; neighbors: string[]; pathIndex: number }> = [];
      const path: string[] = [];

      workStack.push({
        node: startNode.id,
        neighbors: this.graph.outNeighbors(startNode.id),
        pathIndex: 0,
      });

      while (workStack.length > 0) {
        if (workStack.length > maxDepth) break;

        const frame = workStack[workStack.length - 1];

        if (frame.pathIndex === 0) {
          if (stackSet.has(frame.node)) {
            const cycleStart = path.indexOf(frame.node);
            if (cycleStart !== -1) {
              cycles.push([...path.slice(cycleStart), frame.node]);
            }
            stackSet.delete(frame.node);
            path.pop();
            workStack.pop();
            continue;
          }
          if (visited.has(frame.node)) {
            workStack.pop();
            continue;
          }
          stackSet.add(frame.node);
          path.push(frame.node);
        }

        if (frame.pathIndex < frame.neighbors.length) {
          visited.add(frame.node);
          const neighbor = frame.neighbors[frame.pathIndex];
          frame.pathIndex++;
          workStack.push({
            node: neighbor,
            neighbors: this.graph.outNeighbors(neighbor),
            pathIndex: 0,
          });
        } else {
          stackSet.delete(frame.node);
          path.pop();
          workStack.pop();
        }
      }
    }

    return cycles;
  }

  private sanitizeLabel(text: string): string {
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");
  }

  private sanitizeId(id: string): string {
    return id.replace(/[^a-zA-Z0-9_]/g, "_");
  }

  private sanitizeMermaidText(text: string): string {
    return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/%%/g, "\\%%");
  }

  private filterNodesForTarget(targetFile?: string): GraphNode[] {
    if (!targetFile) {
      return this.nodes;
    }
    const lowerTarget = targetFile.toLowerCase().replace(/\\/g, "/");
    return this.nodes.filter((n: GraphNode) => {
      const lowerPath = n.filePath.toLowerCase().replace(/\\/g, "/");
      const basename = lowerPath.split("/").pop() ?? "";
      return basename.includes(lowerTarget) ||
             lowerPath.split("/").some(seg => seg.includes(lowerTarget));
    });
  }
}
