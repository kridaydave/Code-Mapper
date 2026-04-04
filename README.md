# CodeGraph

An MCP server that uses AST parsing to map TypeScript/JavaScript codebase structure and expose codebase intelligence for AI assistants.

## Features

- **AST-based analysis** - Uses `ts-morph` (TypeScript compiler API) to parse code without running it
- **Dependency graphs** - Builds graph representations of how files, functions, and classes relate
- **Impact ranking** - Identifies the most central/critical files using graph centrality metrics
- **Call chain tracing** - Finds dependency paths between any two symbols
- **Mermaid diagrams** - Generates visual dependency diagrams

## MCP Tools

| Tool | Description |
|------|-------------|
| `scan_codebase` | Scan a directory and return a summary of all files, functions, classes, and relationships |
| `find_function` | Search for a function or class by name, returns location, signature, callers, and callees |
| `analyze_dependencies` | Returns the full dependency graph or a subgraph for a specific file (JSON or Mermaid) |
| `rank_impact` | Ranks files by centrality (in-degree, out-degree, betweenness) to identify critical modules |
| `trace_call_chain` | Traces the call chain / dependency path from one function or file to another |

## MCP Resources

| Resource | Description |
|----------|-------------|
| `codebase://summary` | Cached summary of the most recently scanned codebase |
| `codebase://graph/{format}` | Dependency graph in `json` or `mermaid` format |

## Setup

### Install

```bash
npm install
npm run build
```

### Use with Claude Desktop (or any MCP client)

Add this to your MCP client configuration:

```json
{
  "mcpServers": {
    "codebase-cartographer": {
      "command": "npx",
      "args": ["tsx", "/absolute/path/to/codebase-cartographer/src/index.ts"]
    }
  }
}
```

Or after building:

```json
{
  "mcpServers": {
    "codebase-cartographer": {
      "command": "node",
      "args": ["/absolute/path/to/codebase-cartographer/dist/index.js"]
    }
  }
}
```

## Usage

Once connected, AI assistants can:

1. **Scan your codebase**: "Scan my codebase at ./src"
2. **Find symbols**: "Where is the authenticate function defined and who calls it?"
3. **Analyze dependencies**: "Show me the dependency graph as mermaid"
4. **Rank impact**: "What's the most central file in my project?"
5. **Trace paths**: "Trace the call chain from handleRequest to saveToDatabase"

## Architecture

```
src/
├── index.ts              # MCP server entry point (stdio transport)
├── parser/
│   ├── types.ts          # FileInfo, FunctionInfo, ClassInfo, etc.
│   ├── FileAnalyzer.ts   # ts-morph single-file analysis
│   └── ProjectParser.ts  # Directory scanning with caching
├── graph/
│   ├── types.ts          # GraphNode, GraphEdge, RankedFile, etc.
│   ├── GraphBuilder.ts   # Converts ParseResult to graphology Graph
│   └── GraphAnalyzer.ts  # Centrality, path finding, cycle detection
└── mcp/
    ├── cache.ts          # Shared analyzer cache
    ├── tools.ts          # 5 MCP tool definitions
    └── resources.ts      # MCP resource definitions
```

## Tech Stack

- **ts-morph** - TypeScript AST parsing (wraps the TypeScript compiler API)
- **graphology** - Graph data structure for dependency mapping
- **graphology-metrics** - Centrality algorithms (betweenness, degree, etc.)
- **graphology-shortest-path** - Bidirectional shortest path finding
- **@modelcontextprotocol/server** - MCP server SDK with stdio transport
- **zod** - Schema validation for tool inputs

## Ignored Directories

By default, these directories are excluded from scanning:
- `node_modules`, `dist`, `build`, `.git`, `coverage`
- `.next`, `.nuxt`, `.svelte-kit`, `__tests__`, `.cache`

## License

MIT
