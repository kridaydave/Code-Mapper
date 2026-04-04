# Codebase Cartographer Agent Guidelines

## Build, Lint, and Test Commands

### Build Commands
- `npm run build` - Compiles TypeScript to JavaScript using tsc
- Output directory: ./dist (configured in tsconfig.json)
- Entry point: dist/index.js

### Development Commands
- `npm run dev` - Runs the MCP server directly with tsx for development
- Uses tsx for instant TypeScript execution without compilation
- Primary development workflow

### Production Commands
- `npm start` - Runs the compiled JavaScript from dist/index.js
- Used after running npm run build

### Testing Guidelines
No existing test framework is configured in this repository. For adding tests:

1. **Recommended Setup**:
   ```bash
   npm install --save-dev vitest @vitest/coverage-v8
   ```

2. **Add to package.json**:
   ```json
   "scripts": {
     "test": "vitest run",
     "test:watch": "vitest",
     "test:cover": "vitest run --coverage"
   }
   ```

3. **Test File Convention**:
   - Place tests in __tests__ directory or alongside source files with .test.ts suffix
   - Example: src/mcp/tools.test.ts

4. **Running Specific Tests**:
   - Single test file: `npx vitest src/mcp/tools.test.ts`
   - Test with pattern: `npx vitest run -t "scan_codebase"`

### Type Checking
- `npx tsc --noEmit` - Performs type checking without emitting files
- Already enabled via "strict": true in tsconfig.json
- Run as part of CI/CD pipeline

## Code Style Guidelines

### Import Order
1. Node.js built-in modules (`node:path`, `node:fs`)
2. External libraries (`@modelcontextprotocol/server`, `zod`, `ts-morph`)
3. Internal project imports (relative paths)
4. Sort alphabetically within each group
5. Prefer named imports over default imports when practical

Example:
```typescript
import { resolve } from "node:path";
import * as fs from "node:fs";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { ProjectParser } from "../parser/ProjectParser.js";
```

### Formatting
- Indentation: 2 spaces
- Line width: Maximum 100 characters (soft limit)
- Semicolons: Required
- Quotes: Single quotes for strings
- Trailing commas: Multiline objects and arrays
- Function spacing: Empty line between function declarations
- Brace style: Opening brace on same line, closing brace on new line

### Types and Interfaces
- Prefer interfaces for object shapes that may be extended
- Use type aliases for unions, primitives, and mapped types
- Enable strict null checks (`strict`: true in tsconfig)
- Explicit return types for exported functions
- Use `unknown` instead of `any` when type is truly unknown
- Specify generic constraints when possible

Example:
```typescript
interface FileInfo {
  relativePath: string;
  functions: FunctionInfo[];
  classes: ClassInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  totalLines: number;
}

type GraphCallback = (node: GraphNode) => boolean | void;
```

### Naming Conventions
- Variables and functions: camelCase
- Classes and interfaces: PascalCase
- Constants: UPPER_SNAKE_CASE
- File names: kebab-case (.ts files)
- Acronyms: Treat as normal words (e.g., "getNodeID" not "getNodeId")
- Private properties: No underscore prefix (use TypeScript privacy modifiers)

Example:
```typescript
class ProjectParser {
  private cache: Map<string, ParseResult> = new Map();
  
  async parse(directory: string): Promise<ParseResult> {
    // implementation
  }
  
  private findFiles(directory: string): string[] {
    // implementation
  }
}
```

### Error Handling
- Use try/catch for asynchronous operations
- Provide meaningful error messages with context
- Don't catch errors unless you can handle or enhance them
- For MCP tools, errors are automatically caught and returned as error content
- Validate inputs early using Zod schemas (already implemented)
- Process exits with non-zero code for unrecoverable errors (see index.ts)

### Comments and Documentation
- JSDoc comments for all exported functions and classes
- Explain non-obvious logic with inline comments
- Keep comments up-to-date when modifying code
- Use TODO: and FIXME: comments for tracking work
- Document complex type manipulations

Example:
```typescript
/**
 * Scans a directory and returns a summary of all files, functions, classes, and their relationships.
 * Use this first before any other analysis.
 */
server.registerTool("scan_codebase", {
  // ...
});
```

### Project-Specific Patterns
- MCP tool registration follows consistent pattern in tools.ts
- Shared cache pattern used in mcp/cache.ts for analyzer instances
- Error handling in main() function with process.exit(1) for fatal errors
- Shebang line in index.ts for direct execution
- Graph algorithms separated from MCP interface layer
- Parsing and analysis layers clearly separated

### Dependency Management
- Keep dependencies up-to-date with `npm update`
- Audit for vulnerabilities with `npm audit`
- Peer dependencies not used in this project
- Dev dependencies limited to TypeScript tooling

## MCP Protocol Implementation
All MCP tools follow this pattern:
1. Define tool name, description, and input/output schemas using Zod
2. Implement handler function with proper async/await
3. Return structured content with text and structuredContent fields
4. Handle edge cases (empty results, not found, etc.)
5. Use analyzer cache to avoid reprocessing same directories

## File Organization
- src/index.ts - MCP server entry point
- src/mcp/ - MCP-specific code (tools, resources, caching)
- src/parser/ - TS-Morph based code analysis
- src/graph/ - Graph theory algorithms and data structures
- Separation of concerns between parsing, analysis, and MCP interface