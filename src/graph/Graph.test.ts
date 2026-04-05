import { describe, it, expect, beforeEach } from "vitest";
import { ProjectParser } from "../parser/ProjectParser.js";
import { GraphBuilder } from "../graph/GraphBuilder.js";
import { GraphAnalyzer } from "../graph/GraphAnalyzer.js";
import path from "node:path";

describe("GraphBuilder", () => {
  let parser: ProjectParser;
  let builder: GraphBuilder;
  let parseResult: Awaited<ReturnType<ProjectParser["parse"]>>;

  beforeEach(async () => {
    parser = new ProjectParser();
    builder = new GraphBuilder();
    const testDir = path.resolve("./fixtures/test-project");
    parseResult = await parser.parse(testDir);
  });

  describe("build", () => {
    it("should build a graph from parse result", () => {
      const { graph, nodes, edges } = builder.build(parseResult);

      expect(graph.order).toBeGreaterThan(0);
      expect(nodes.length).toBeGreaterThan(0);
      expect(edges.length).toBeGreaterThan(0);
    });

    it("should create file nodes", () => {
      const { nodes } = builder.build(parseResult);

      const fileNodes = nodes.filter(n => n.kind === "file");
      expect(fileNodes.length).toBe(3);
    });

    it("should create function nodes", () => {
      const { nodes } = builder.build(parseResult);

      const fnNodes = nodes.filter(n => n.kind === "function");
      expect(fnNodes.length).toBe(3);
    });

    it("should create class nodes", () => {
      const { nodes } = builder.build(parseResult);

      const classNodes = nodes.filter(n => n.kind === "class");
      expect(classNodes.length).toBe(1);
    });

    it("should create import edges between files", () => {
      const { edges } = builder.build(parseResult);

      const importEdges = edges.filter(e => e.kind === "imports");
      expect(importEdges.length).toBeGreaterThan(0);
    });

    it("should create containment edges", () => {
      const { edges } = builder.build(parseResult);

      const containsEdges = edges.filter(e => e.kind === "contains");
      expect(containsEdges.length).toBeGreaterThan(0);
    });
  });
});

describe("GraphAnalyzer", () => {
  let parser: ProjectParser;
  let builder: GraphBuilder;
  let analyzer: GraphAnalyzer;
  let parseResult: Awaited<ReturnType<ProjectParser["parse"]>>;

  beforeEach(async () => {
    parser = new ProjectParser();
    builder = new GraphBuilder();
    const testDir = path.resolve("./fixtures/test-project");
    parseResult = await parser.parse(testDir);
    const { graph, nodes, edges } = builder.build(parseResult);
    analyzer = new GraphAnalyzer(graph, parseResult, nodes, edges);
  });

  describe("rankImpact", () => {
    it("should rank files by in-degree", () => {
      const ranked = analyzer.rankImpact("inDegree");

      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0]).toHaveProperty("relativePath");
      expect(ranked[0]).toHaveProperty("score");
    });

    it("should rank files by out-degree", () => {
      const ranked = analyzer.rankImpact("outDegree");

      expect(ranked.length).toBeGreaterThan(0);
    });

    it("should rank files by betweenness", () => {
      const ranked = analyzer.rankImpact("betweenness");

      expect(ranked.length).toBeGreaterThan(0);
    });

    it("should include file metrics in ranking", () => {
      const ranked = analyzer.rankImpact("inDegree");

      expect(ranked[0]).toHaveProperty("functionCount");
      expect(ranked[0]).toHaveProperty("classCount");
      expect(ranked[0]).toHaveProperty("importCount");
      expect(ranked[0]).toHaveProperty("exportCount");
    });
  });

  describe("findFunction", () => {
    it("should find functions by name", () => {
      const matches = analyzer.findFunction("add", "function");

      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].name).toBe("add");
    });

    it("should find classes by name", () => {
      const matches = analyzer.findFunction("Calculator", "class");

      expect(matches.length).toBe(1);
      expect(matches[0].name).toBe("Calculator");
    });

    it("should find both functions and classes when type is any", () => {
      const matches = analyzer.findFunction("Calculator", "any");

      expect(matches.length).toBe(1);
    });

    it("should return empty for non-existent symbol", () => {
      const matches = analyzer.findFunction("NonExistentSymbol", "any");

      expect(matches).toEqual([]);
    });
  });

  describe("getCallers and getCallees", () => {
    it("should get callers for a node", () => {
      const nodes = analyzer.getNodes();
      const fileNode = nodes.find(n => n.kind === "file" && n.label.includes("calculator"));

      if (fileNode) {
        const callers = analyzer.getCallers(fileNode.id);
        expect(callers).toBeDefined();
      }
    });

    it("should get callees for a node", () => {
      const nodes = analyzer.getNodes();
      const fileNode = nodes.find(n => n.kind === "file" && n.label.includes("calculator"));

      if (fileNode) {
        const callees = analyzer.getCallees(fileNode.id);
        expect(callees).toBeDefined();
      }
    });
  });

  describe("traceCallChain", () => {
    it("should find paths between nodes", () => {
      const result = analyzer.traceCallChain("add", "Calculator");

      expect(result).toHaveProperty("found");
      expect(result).toHaveProperty("paths");
    });

    it("should return empty for non-existent nodes", () => {
      const result = analyzer.traceCallChain("NonExistent", "AlsoNotHere");

      expect(result.found).toBe(false);
      expect(result.paths).toEqual([]);
    });
  });

  describe("toMermaid", () => {
    it("should generate mermaid diagram", () => {
      const mermaid = analyzer.toMermaid();

      expect(mermaid).toContain("graph TD");
      expect(mermaid).toContain("-->");
    });

    it("should filter by target file", () => {
      const mermaid = analyzer.toMermaid("calculator");

      expect(mermaid).toContain("graph TD");
    });
  });

  describe("detectCycles", () => {
    it("should detect cycles in the graph", () => {
      const cycles = analyzer.detectCycles();

      expect(cycles).toBeDefined();
      expect(Array.isArray(cycles)).toBe(true);
    });
  });

  describe("getGraph, getNodes, getEdges, getParseResult", () => {
    it("should return the graph", () => {
      const graph = analyzer.getGraph();
      expect(graph).toBeDefined();
    });

    it("should return nodes", () => {
      const nodes = analyzer.getNodes();
      expect(nodes.length).toBeGreaterThan(0);
    });

    it("should return edges", () => {
      const edges = analyzer.getEdges();
      expect(edges.length).toBeGreaterThan(0);
    });

    it("should return parse result", () => {
      const result = analyzer.getParseResult();
      expect(result.totalFiles).toBe(3);
    });
  });
});
