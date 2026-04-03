export interface FunctionInfo {
  name: string;
  filePath: string;
  lineNumber: number;
  parameters: string[];
  returnType: string;
  isAsync: boolean;
  isExported: boolean;
  isDefaultExport: boolean;
  body: string;
}

export interface MethodInfo {
  name: string;
  parameters: string[];
  returnType: string;
  isStatic: boolean;
  isAsync: boolean;
  lineNumber: number;
}

export interface PropertyInfo {
  name: string;
  type: string;
  isStatic: boolean;
  isReadonly: boolean;
  lineNumber: number;
}

export interface ClassInfo {
  name: string;
  filePath: string;
  lineNumber: number;
  isExported: boolean;
  isDefaultExport: boolean;
  extends: string | null;
  implements: string[];
  methods: MethodInfo[];
  properties: PropertyInfo[];
}

export interface ImportInfo {
  namedImports: string[];
  defaultImport: string | null;
  namespaceImport: string | null;
  moduleSpecifier: string;
  filePath: string;
  lineNumber: number;
}

export interface ExportInfo {
  name: string;
  kind: "function" | "class" | "variable" | "type" | "interface" | "re-export";
  isDefault: boolean;
  filePath: string;
  lineNumber: number;
}

export interface FileInfo {
  filePath: string;
  relativePath: string;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  totalLines: number;
}

export interface ParseResult {
  directory: string;
  files: FileInfo[];
  totalFiles: number;
  totalFunctions: number;
  totalClasses: number;
  totalImports: number;
  totalExports: number;
}
