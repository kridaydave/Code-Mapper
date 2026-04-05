import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Graph: typeof import("graphology").default = require("graphology");
import type { AbstractGraph, Attributes } from "graphology-types";
import { ParseResult } from "../parser/types.js";
import { GraphNode, GraphEdge } from "./types.js";

type CodeGraph = AbstractGraph<Attributes, Attributes, Attributes>;

export class GraphBuilder {
  build(parseResult: ParseResult): { graph: CodeGraph; nodes: GraphNode[]; edges: GraphEdge[] } {
    const graph = new Graph({ multi: true });
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    const classLookup = new Map<string, { filePath: string; name: string; lineNumber: number }>();
    for (const fileInfo of parseResult.files) {
      for (const cls of fileInfo.classes) {
        classLookup.set(fileInfo.filePath + "::" + cls.name, { filePath: fileInfo.filePath, name: cls.name, lineNumber: cls.lineNumber });
      }
    }

    const fileNodeIds = new Map<string, string>();

    // Phase 1: Create file nodes
    for (const fileInfo of parseResult.files) {
      const fileId = `file:${fileInfo.filePath}`;
      fileNodeIds.set(fileInfo.relativePath, fileId);
      fileNodeIds.set(fileInfo.filePath, fileId);

      graph.addNode(fileId, {
        kind: "file",
        label: fileInfo.relativePath,
        filePath: fileInfo.filePath,
      });

      nodes.push({
        id: fileId,
        kind: "file",
        label: fileInfo.relativePath,
        filePath: fileInfo.filePath,
      });
    }

    // Phase 2: Create function and class nodes, add containment edges
    for (const fileInfo of parseResult.files) {
      const fileId = `file:${fileInfo.filePath}`;

      for (const fn of fileInfo.functions) {
        const fnId = `fn:${fileInfo.filePath}:${fn.name}:${fn.lineNumber}`;
        graph.addNode(fnId, {
          kind: "function",
          label: fn.name,
          filePath: fileInfo.filePath,
          lineNumber: fn.lineNumber,
        });

        graph.addEdge(fileId, fnId, {
          kind: "contains",
          label: `contains ${fn.name}`,
        });

        edges.push({
          source: fileId,
          target: fnId,
          kind: "contains",
          label: `contains ${fn.name}`,
        });

        nodes.push({
          id: fnId,
          kind: "function",
          label: fn.name,
          filePath: fileInfo.filePath,
          lineNumber: fn.lineNumber,
        });
      }

      for (const cls of fileInfo.classes) {
        const clsId = `class:${fileInfo.filePath}:${cls.name}:${cls.lineNumber}`;
        graph.addNode(clsId, {
          kind: "class",
          label: cls.name,
          filePath: fileInfo.filePath,
          lineNumber: cls.lineNumber,
        });

        graph.addEdge(fileId, clsId, {
          kind: "contains",
          label: `contains ${cls.name}`,
        });

        edges.push({
          source: fileId,
          target: clsId,
          kind: "contains",
          label: `contains ${cls.name}`,
        });

        nodes.push({
          id: clsId,
          kind: "class",
          label: cls.name,
          filePath: fileInfo.filePath,
          lineNumber: cls.lineNumber,
        });
      }
    }

    // Phase 3: Build import edges between files
    for (const fileInfo of parseResult.files) {
      const sourceFileId = `file:${fileInfo.filePath}`;

      for (const imp of fileInfo.imports) {
        const targetPath = this.resolveImportPath(fileInfo.filePath, imp.moduleSpecifier, parseResult);
        if (targetPath) {
          const targetFileId = `file:${targetPath}`;
          if (graph.hasNode(targetFileId)) {
            const edgeLabel = imp.namedImports.length > 0
              ? `imports {${imp.namedImports.join(", ")}}`
              : imp.defaultImport
                ? `imports ${imp.defaultImport}`
                : "imports module";

            if (!graph.hasEdge(sourceFileId, targetFileId)) {
              graph.addEdge(sourceFileId, targetFileId, {
                kind: "imports",
                label: edgeLabel,
              });

              edges.push({
                source: sourceFileId,
                target: targetFileId,
                kind: "imports",
                label: edgeLabel,
              });
            }
          }
        }
      }
    }

    // Phase 4: Build extends/implements edges for classes
    for (const fileInfo of parseResult.files) {
      for (const cls of fileInfo.classes) {
        const clsId = `class:${fileInfo.filePath}:${cls.name}:${cls.lineNumber}`;

        if (cls.extends) {
          // Try to find the parent class in the codebase
          const parentName = cls.extends.split("<")[0].trim(); // Handle generics
          const parentClass = this.findClassByName(parentName, parseResult, classLookup);
          if (parentClass) {
            const parentId = `class:${parentClass.filePath}:${parentClass.name}:${parentClass.lineNumber}`;
            if (graph.hasNode(parentId)) {
              graph.addEdge(clsId, parentId, {
                kind: "extends",
                label: `extends ${parentClass.name}`,
              });
              edges.push({
                source: clsId,
                target: parentId,
                kind: "extends",
                label: `extends ${parentClass.name}`,
              });
            }
          }
        }

        for (const impl of cls.implements) {
          const implName = impl.split("<")[0].trim();
          const implClass = this.findClassByName(implName, parseResult, classLookup);
          if (implClass) {
            const implId = `class:${implClass.filePath}:${implClass.name}:${implClass.lineNumber}`;
            if (graph.hasNode(implId)) {
              graph.addEdge(clsId, implId, {
                kind: "implements",
                label: `implements ${implClass.name}`,
              });
              edges.push({
                source: clsId,
                target: implId,
                kind: "implements",
                label: `implements ${implClass.name}`,
              });
            }
          }
        }
      }
    }

    return { graph, nodes, edges };
  }

  private resolveImportPath(fromFile: string, moduleSpecifier: string, parseResult: ParseResult): string | null {
    // Skip external packages (no leading . or /)
    if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
      return null;
    }

    // Strip .js/.jsx/.ts/.tsx extension from the specifier
    let specifier = moduleSpecifier;
    for (const ext of [".js", ".jsx", ".ts", ".tsx"]) {
      if (specifier.endsWith(ext)) {
        specifier = specifier.slice(0, -ext.length);
        break;
      }
    }

    // Resolve relative path using forward-slash logic (ts-morph always uses /)
    const fromDir = fromFile.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
    const parts = [...(fromDir === "" ? [] : fromDir.split("/")), ...specifier.split("/")];
    const resolved: string[] = [];
     for (const part of parts) {
       if (part === "..") {
         if (resolved.length > 0) {
           resolved.pop();
         }
         // else: excessive ".." — ignore, prevents escaping root
       } else if (part !== "." && part !== "") {
         resolved.push(part);
       }
     }
     // Reconstruct with the drive prefix if present
     let resolvedPath = resolved.join("/");
     // If original fromFile had a Windows drive letter, preserve it
     const fromFileNormalized = fromFile.replace(/\\/g, "/");
     const driveMatch = fromFileNormalized.match(/^([A-Za-z]:\/)/);
      if (driveMatch && !resolvedPath.startsWith(driveMatch[1])) {
        resolvedPath = driveMatch[1] + resolvedPath;
      }

    // Try exact match first
    if (parseResult.files.some(f => f.filePath === resolvedPath)) {
      return resolvedPath;
    }

    // Try adding extensions
    const extensions = [".ts", ".tsx", ".js", ".jsx", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"];
    for (const ext of extensions) {
      const candidate = resolvedPath + ext;
      if (parseResult.files.some(f => f.filePath === candidate)) {
        return candidate;
      }
    }

    return null;
  }

  private findClassByName(name: string, _parseResult: ParseResult, classLookup: Map<string, { filePath: string; name: string; lineNumber: number }>): { filePath: string; name: string; lineNumber: number } | null {
    for (const [_key, value] of classLookup) {
      if (value.name === name) {
        return value;
      }
    }
    return null;
  }
}
