#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server";
import { registerTools } from "./mcp/tools.js";
import { registerResources } from "./mcp/resources.js";
async function main() {
    const server = new McpServer({
        name: "codebase-cartographer",
        version: "1.0.0",
    }, {
        instructions: "Codebase Cartographer analyzes TypeScript/JavaScript codebases using AST parsing. " +
            "Always start by calling scan_codebase with the target directory. " +
            "Then use find_function to locate symbols, analyze_dependencies to see the graph, " +
            "rank_impact to find central files, or trace_call_chain to follow dependency paths. " +
            "The codebase://summary and codebase://graph/{format} resources provide cached views.",
    });
    // Register all tools and resources
    registerTools(server);
    registerResources(server);
    // Connect via stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Codebase Cartographer MCP server running on stdio");
}
main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
});
//# sourceMappingURL=index.js.map