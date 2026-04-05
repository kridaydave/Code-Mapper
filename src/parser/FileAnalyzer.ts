import { SourceFile, Project } from "ts-morph";
import { FileInfo, FunctionInfo, ClassInfo, ImportInfo, ExportInfo, MethodInfo, PropertyInfo } from "./types.js";

export class FileAnalyzer {
  private project: Project;
  private baseDirectory: string;

  constructor(project: Project, baseDirectory: string) {
    this.project = project;
    this.baseDirectory = baseDirectory;
  }

  analyze(sourceFile: SourceFile): FileInfo {
    const filePath = sourceFile.getFilePath();
    const relativePath = this.relativePath(this.baseDirectory, filePath);

    return {
      filePath,
      relativePath,
      functions: this.extractFunctions(sourceFile),
      classes: this.extractClasses(sourceFile),
      imports: this.extractImports(sourceFile),
      exports: this.extractExports(sourceFile),
      totalLines: sourceFile.getEndLineNumber() ?? 0,
    };
  }

  private relativePath(base: string, target: string): string {
    const baseParts = base.replace(/\\/g, "/").split("/").filter(Boolean);
    const targetParts = target.replace(/\\/g, "/").split("/").filter(Boolean);

    // Find common prefix
    let i = 0;
    while (i < baseParts.length && i < targetParts.length && baseParts[i] === targetParts[i]) {
      i++;
    }

    // Verify target is actually within base directory
    if (i < baseParts.length) {
      throw new Error(`Target path is not within base directory: ${target} not in ${base}`);
    }

    const up = baseParts.length - i;
    const down = targetParts.slice(i);
    return [...Array(up).fill(".."), ...down].join("/");
  }

  private extractFunctions(sourceFile: SourceFile): FunctionInfo[] {
    return sourceFile.getFunctions().map(fn => {
      const name = fn.getName() ?? "anonymous";
      const params = fn.getParameters().map(p => {
        const paramName = p.getName();
        const paramType = p.getTypeNode()?.getText() ?? "unknown";
        return `${paramName}: ${paramType}`;
      });
      const returnType = fn.getReturnTypeNode()?.getText() ?? "void";
       const body = fn.getBody()?.getText() ?? "";
       const truncatedBody = [...body].slice(0, 200).join("");

       return {
         name,
         filePath: sourceFile.getFilePath(),
         lineNumber: fn.getStartLineNumber(),
         parameters: params,
         returnType,
         isAsync: fn.isAsync(),
         isExported: fn.isExported(),
         isDefaultExport: fn.isDefaultExport(),
         body: truncatedBody,
       };
    });
  }

  private extractClasses(sourceFile: SourceFile): ClassInfo[] {
    return sourceFile.getClasses().map(cls => {
      const methods: MethodInfo[] = cls.getMethods().map(m => ({
        name: m.getName() ?? "anonymous",
        parameters: m.getParameters().map(p => `${p.getName()}: ${p.getTypeNode()?.getText() ?? "unknown"}`),
        returnType: m.getReturnTypeNode()?.getText() ?? "void",
        isStatic: m.isStatic(),
        isAsync: m.isAsync(),
        lineNumber: m.getStartLineNumber(),
      }));

      const properties: PropertyInfo[] = cls.getProperties().map(p => ({
        name: p.getName(),
        type: p.getTypeNode()?.getText() ?? "unknown",
        isStatic: p.isStatic(),
        isReadonly: p.isReadonly(),
        lineNumber: p.getStartLineNumber(),
      }));

      const extendsClause = cls.getExtends();
      const implementsClauses = cls.getImplements();

      return {
        name: cls.getName() ?? "anonymous",
        filePath: sourceFile.getFilePath(),
        lineNumber: cls.getStartLineNumber(),
        isExported: cls.isExported(),
        isDefaultExport: cls.isDefaultExport(),
        extends: extendsClause?.getText() ?? null,
        implements: implementsClauses.map(i => i.getText()),
        methods,
        properties,
      };
    });
  }

  private extractImports(sourceFile: SourceFile): ImportInfo[] {
    return sourceFile.getImportDeclarations().map(imp => {
      const namedImports = imp.getNamedImports().map(n => n.getName());
      const defaultImport = imp.getDefaultImport()?.getText() ?? null;
      const namespaceImport = imp.getNamespaceImport()?.getText() ?? null;

      return {
        namedImports,
        defaultImport,
        namespaceImport,
        moduleSpecifier: imp.getModuleSpecifierValue() ?? null,
        filePath: sourceFile.getFilePath(),
        lineNumber: imp.getStartLineNumber(),
      };
    });
  }

  private extractExports(sourceFile: SourceFile): ExportInfo[] {
    const exports: ExportInfo[] = [];

    sourceFile.getFunctions().forEach(fn => {
      if (fn.isExported()) {
        exports.push({
          name: fn.getName() ?? "anonymous",
          kind: "function",
          isDefault: fn.isDefaultExport(),
          filePath: sourceFile.getFilePath(),
          lineNumber: fn.getStartLineNumber(),
        });
      }
    });

    sourceFile.getClasses().forEach(cls => {
      if (cls.isExported()) {
        exports.push({
          name: cls.getName() ?? "anonymous",
          kind: "class",
          isDefault: cls.isDefaultExport(),
          filePath: sourceFile.getFilePath(),
          lineNumber: cls.getStartLineNumber(),
        });
      }
    });

    sourceFile.getExportDeclarations().forEach(exp => {
      const namedExports = exp.getNamedExports();
      if (namedExports.length > 0) {
        namedExports.forEach(ne => {
          exports.push({
            name: ne.getName(),
            kind: "re-export",
            isDefault: false,
            filePath: sourceFile.getFilePath(),
            lineNumber: exp.getStartLineNumber(),
          });
        });
      }
    });

    sourceFile.getVariableStatements().forEach(stmt => {
      if (stmt.isExported()) {
        stmt.getDeclarations().forEach(decl => {
          exports.push({
            name: decl.getName(),
            kind: "variable" as const,
            isDefault: false,
            filePath: sourceFile.getFilePath(),
            lineNumber: stmt.getStartLineNumber(),
          });
        });
      }
    });

    sourceFile.getTypeAliases().forEach(ta => {
      if (ta.isExported()) {
        exports.push({
          name: ta.getName(),
          kind: "type" as const,
          isDefault: false,
          filePath: sourceFile.getFilePath(),
          lineNumber: ta.getStartLineNumber(),
        });
      }
    });

    sourceFile.getInterfaces().forEach(iface => {
      if (iface.isExported()) {
        exports.push({
          name: iface.getName(),
          kind: "interface" as const,
          isDefault: false,
          filePath: sourceFile.getFilePath(),
          lineNumber: iface.getStartLineNumber(),
        });
      }
    });

    const seen = new Set<string>();
    return exports.filter(exp => {
      const key = `${exp.name}|${exp.kind}|${exp.lineNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
}
