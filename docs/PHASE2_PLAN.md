# CodeGraph Phase 2 Implementation Plan

## Overview

This document outlines the implementation plan for Phase 2 of CodeGraph, focusing on new features and improvements to existing functionality.

---

## 1. Export Format Enhancements

### 1.1 DOT (Graphviz) Export

**Objective**: Add support for exporting dependency graphs in DOT format, enabling visualization with Graphviz, Webgraphviz, and other DOT-compatible tools.

**Implementation Details**:

- **Location**: `src/graph/GraphAnalyzer.ts`
- **New Method**: `toDot(targetFile?: string): string`
- **DOT Format Specification**:
  ```dot
  digraph code_graph {
    rankdir=LR;
    node [shape=box];
    
    "file:src/index.ts" [label="index.ts", style=filled, fillcolor=lightblue];
    "file:src/utils.ts" [label="utils.ts"];
    
    "file:src/index.ts" -> "file:src/utils.ts" [label="imports"];
  }
  ```

**Node Styling by Type**:
| Kind | Shape | Color |
|------|-------|-------|
| file | box | lightblue |
| function | ellipse | lightgreen |
| class | box3d | lightyellow |

**Edge Styling by Type**:
| Kind | Style | Color |
|------|-------|-------|
| imports | solid | black |
| contains | dotted | gray |
| extends | dashed | blue |
| implements | dashed | green |

**Deliverables**:
- `toDot()` method in GraphAnalyzer
- Support for filtered graphs (targetFile parameter)
- Node/edge styling based on kind

### 1.2 PlantUML Export

**Objective**: Add support for exporting dependency graphs in PlantUML format, enabling visualization with PlantUML server and IDE plugins.

**Implementation Details**:

- **Location**: `src/graph/GraphAnalyzer.ts`
- **New Method**: `toPlantUML(targetFile?: string): string`
- **PlantUML Format Specification**:
  ```plantuml
  @startuml
  skinparam linetype ortho
  
  component "index.ts" as index
  component "utils.ts" as utils
  
  index -down-> utils : imports
  @enduml
  ```

**Deliverables**:
- `toPlantUML()` method in GraphAnalyzer
- Support for component diagrams
- Proper escaping of special characters

---

## 2. Graph Metrics Enhancement

### 2.1 PageRank Metric

**Objective**: Add PageRank as a centrality metric to identify influential files in the dependency graph.

**Implementation Details**:

- **Dependency**: Install `graphology-pagerank`
- **Location**: `src/graph/GraphAnalyzer.ts`
- **Method Modification**: Extend `rankImpact()` to support `metric: "pagerank"`

**PageRank Algorithm**:
- Iterative algorithm that ranks nodes based on incoming links
- Accounts for indirect dependencies through random walks
- Useful for identifying "hub" files that connect many modules

**Command**:
```bash
npm install graphology-pagerank
```

**Code Changes**:
```typescript
import pagerank from "graphology-pagerank";

// In rankImpact method:
if (metric === "pagerank") {
  const ranks = pagerank(this.graph);
  for (const [node, score] of Object.entries(ranks)) {
    scores.set(node, score);
  }
}
```

**Deliverables**:
- Install graphology-pagerank dependency
- Extend rankImpact to support pagerank metric
- Update MCP tool schema

---

## 3. Code Complexity Analysis

### 3.1 ComplexityAnalyzer

**Objective**: Analyze code complexity metrics for each file, enabling identification of files that may need refactoring.

**Implementation Details**:

- **New File**: `src/parser/ComplexityAnalyzer.ts`
- **Metrics Calculated**:

| Metric | Description | Threshold |
|--------|-------------|-----------|
| Cyclomatic Complexity | Number of linearly independent paths through code | > 10 is concerning |
| Cognitive Complexity | How hard code is to understand | > 15 is concerning |
| Nesting Depth | Maximum nesting level of control structures | > 4 is concerning |
| Lines of Code | Total lines in file | > 500 is large |
| Function Count | Number of functions in file | > 20 is many |
| Class Count | Number of classes in file | > 10 is many |

**Class Structure**:
```typescript
export interface ComplexityResult {
  filePath: string;
  relativePath: string;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;
  linesOfCode: number;
  functionCount: number;
  classCount: number;
  overallScore: number;  // Normalized 0-100
  issues: string[];      // List of identified issues
}

export class ComplexityAnalyzer {
  analyze(sourceFile: SourceFile): ComplexityResult;
  analyzeProject(parseResult: ParseResult): ComplexityResult[];
  getTopComplexFiles(n: number): ComplexityResult[];
}
```

**Cyclomatic Complexity Calculation**:
```
CC = E - N + 2P

Where:
- E = number of edges (control flow paths)
- N = number of nodes
- P = number of connected components
```

Simplified approach: Count decision points (if, for, while, switch, catch, &&, ||)

**Cognitive Complexity Calculation**:
- Increments for:
  - Nesting level (+1 per level)
  - Control flow keywords (+1 each)
  - Short-circuit logic (+1)
  - Recursion (+1)
- No increments for:
  - Simple method calls
  - Property access

**Deliverables**:
- New `ComplexityAnalyzer` class
- Integration with existing parser
- New MCP tool: `analyze_complexity`

---

## 4. Progress Indicators

### 4.1 Progress Reporting

**Objective**: Add progress reporting for large codebase scans, improving user experience.

**Implementation Details**:

- **Location**: `src/parser/ProjectParser.ts`
- **Mechanism**: Progress callback function

**Interface**:
```typescript
interface ProgressCallback {
  (progress: ProgressInfo): void;
}

interface ProgressInfo {
  phase: "scanning" | "parsing" | "analyzing";
  current: number;
  total: number;
  currentFile?: string;
  percentComplete: number;
}
```

**Usage in ProjectParser**:
```typescript
interface ParseOptions {
  directory: string;
  onProgress?: ProgressCallback;
  maxFiles?: number;
}

async parse(options: ParseOptions): Promise<ParseResult> {
  const files = this.findFiles(directory);
  const total = files.length;
  
  for (let i = 0; i < files.length; i++) {
    // ... parse file
    
    if (options.onProgress) {
      options.onProgress({
        phase: "parsing",
        current: i + 1,
        total,
        currentFile: files[i],
        percentComplete: Math.round(((i + 1) / total) * 100)
      });
    }
  }
}
```

**Deliverables**:
- Progress callback option in ProjectParser
- Progress information in MCP responses (via structuredContent)
- Console logging fallback

---

## 5. Error Message Improvements

### 5.1 Enhanced Error Messages

**Objective**: Provide more helpful error messages with suggestions for common issues.

**Implementation Details**:

- **Location**: `src/mcp/tools.ts`
- **Pattern**: Error messages should include:
  - What went wrong
  - Why it happened
  - How to fix it

**Error Categories**:

| Error | Suggestion |
|-------|------------|
| Directory not found | "Did you mean: ./src"? |
| No TypeScript files | "Ensure your directory contains .ts/.tsx files" |
| Too many files | "Consider scanning a subdirectory" |
| Permission denied | "Check file permissions" |
| Empty result | "Directory may be empty or all files are ignored" |

**Implementation**:
```typescript
function getErrorMessage(error: Error, context: Record<string, unknown>): string {
  const baseMessage = error.message;
  
  if (error.message.includes("does not exist")) {
    return `${baseMessage}. Did you mean to use an absolute path?`;
  }
  
  if (error.message.includes("Too many files")) {
    return `${baseMessage}. Try scanning a specific subdirectory like ./src/components`;
  }
  
  return baseMessage;
}
```

**Deliverables**:
- Enhanced error handling in safeHandler
- Context-aware error suggestions
- Structured error codes

---

## 6. MCP Tool Updates

### 6.1 Updated analyze_dependencies

**Changes**:
```typescript
inputSchema: z.object({
  directory: z.string(),
  targetFile: z.string().optional(),
  format: z.enum(["json", "mermaid", "dot", "plantuml"]).default("json"),
}));

outputSchema: z.object({
  format: z.string(),
  nodeCount: z.number(),
  edgeCount: z.number(),
  nodes: z.array(...),
  edges: z.array(...),
  cycles: z.array(...),
  mermaid: z.string().optional(),
  dot: z.string().optional(),        // NEW
  plantuml: z.string().optional(),   // NEW
}));
```

### 6.2 Updated rank_impact

**Changes**:
```typescript
inputSchema: z.object({
  directory: z.string(),
  metric: z.enum(["inDegree", "outDegree", "betweenness", "pagerank"]).default("inDegree"),
  topN: z.number().default(10),
}));
```

### 6.3 New Tool: analyze_complexity

**New Tool Registration**:
```typescript
server.registerTool(
  "analyze_complexity",
  {
    title: "Analyze Code Complexity",
    description: "Analyze code complexity metrics for each file in the codebase. Identifies files that may need refactoring based on cyclomatic complexity, cognitive complexity, nesting depth, and size.",
    inputSchema: z.object({
      directory: z.string().describe("Path to the codebase directory"),
      threshold: z.number().optional().describe("Minimum complexity score to report"),
      topN: z.number().default(10).describe("Number of most complex files to return"),
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
  async ({ directory, threshold, topN }) => { ... }
);
```

---

## 7. Implementation Order

### Phase 2A: Export Formats (Priority: High)
1. Install graphology-pagerank dependency
2. Add toMermaid() improvements (if needed)
3. Implement toDot() method
4. Implement toPlantUML() method
5. Update analyze_dependencies tool

### Phase 2B: Graph Metrics (Priority: High)
1. Add PageRank support to rankImpact
2. Update rank_impact tool schema

### Phase 2C: Complexity Analysis (Priority: Medium)
1. Create ComplexityAnalyzer class
2. Implement cyclomatic complexity calculation
3. Implement cognitive complexity calculation
4. Add analyze_complexity tool

### Phase 2D: Improvements (Priority: Medium)
1. Add progress callback to ProjectParser
2. Enhance error messages
3. Add suggestions to error responses

---

## 8. Testing Plan

### Unit Tests
- Test toDot() output format
- Test toPlantUML() output format
- Test PageRank metric calculation
- Test ComplexityAnalyzer accuracy

### Integration Tests
- Test full flow with sample project
- Test MCP tool responses

---

## 9. Backward Compatibility

All changes must maintain backward compatibility:
- Existing MCP tool names unchanged
- Existing output formats unchanged
- New fields optional

---

## 10. Success Criteria

1. ✅ DOT export produces valid Graphviz output
2. ✅ PlantUML export produces valid PlantUML output
3. ✅ PageRank metric provides meaningful rankings
4. ✅ Complexity analysis identifies complex files correctly
5. ✅ Progress reporting works for large projects
6. ✅ Error messages include helpful suggestions
7. ✅ All existing tests continue to pass
8. ✅ TypeScript type checking succeeds
