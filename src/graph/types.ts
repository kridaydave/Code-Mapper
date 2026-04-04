export interface GraphNode {
  id: string;
  kind: "file" | "function" | "class";
  label: string;
  filePath: string;
  lineNumber?: number;
  metadata?: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "imports" | "calls" | "extends" | "implements" | "contains";
  label: string;
}

export interface RankedFile {
  filePath: string;
  relativePath: string;
  score: number;
  metric: string;
  functionCount: number;
  classCount: number;
  importCount: number;
  exportCount: number;
}

export interface FunctionMatch {
  name: string;
  filePath: string;
  relativePath: string;
  lineNumber: number;
  kind: "function" | "class";
  parameters: string[];
  returnType: string;
  isExported: boolean;
}

export interface CallChainResult {
  found: boolean;
  paths: string[][];
}
