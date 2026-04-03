import { ResourceTemplate } from "@modelcontextprotocol/server";
import { analyzerCache } from "./cache.js";
export function registerResources(server) {
    // Resource 1: codebase://summary
    server.registerResource("codebase-summary", "codebase://summary", {
        title: "Codebase Summary",
        description: "Returns a summary of the most recently scanned codebase. Scan a codebase first using the scan_codebase tool.",
        mimeType: "application/json",
    }, async () => {
        if (analyzerCache.size === 0) {
            return {
                contents: [{
                        uri: "codebase://summary",
                        text: JSON.stringify({ message: "No codebase has been scanned yet. Use the scan_codebase tool first." }, null, 2),
                    }],
            };
        }
        const summaries = [];
        for (const [directory, analyzer] of analyzerCache) {
            const nodes = analyzer.getNodes();
            const edges = analyzer.getEdges();
            const ranked = analyzer.rankImpact("inDegree");
            const cycles = analyzer.detectCycles();
            const fileNodes = nodes.filter((n) => n.kind === "file");
            const functionNodes = nodes.filter((n) => n.kind === "function");
            const classNodes = nodes.filter((n) => n.kind === "class");
            summaries.push({
                directory,
                totalFiles: fileNodes.length,
                totalFunctions: functionNodes.length,
                totalClasses: classNodes.length,
                totalEdges: edges.length,
                mostCentralFile: ranked.length > 0 ? ranked[0] : null,
                cycleCount: cycles.length,
                topDependencies: ranked.slice(0, 5).map((r) => ({
                    path: r.relativePath,
                    inDegree: r.score,
                })),
            });
        }
        return {
            contents: [{
                    uri: "codebase://summary",
                    text: JSON.stringify({ scannedCodebases: summaries }, null, 2),
                }],
        };
    });
    // Resource 2: codebase://graph/{format}
    server.registerResource("codebase-graph", new ResourceTemplate("codebase://graph/{format}", {
        list: async () => ({
            resources: [
                { uri: "codebase://graph/json", name: "Graph (JSON)" },
                { uri: "codebase://graph/mermaid", name: "Graph (Mermaid)" },
            ],
        }),
    }), {
        title: "Codebase Dependency Graph",
        description: "Returns the dependency graph of the scanned codebase in JSON or Mermaid format.",
        mimeType: "application/json",
    }, async (uri, { format }) => {
        if (analyzerCache.size === 0) {
            return {
                contents: [{
                        uri: uri.href,
                        text: JSON.stringify({ message: "No codebase has been scanned yet. Use the scan_codebase tool first." }, null, 2),
                    }],
            };
        }
        // Use the most recently added analyzer
        const lastKey = Array.from(analyzerCache.keys()).pop();
        const analyzer = analyzerCache.get(lastKey);
        const nodes = analyzer.getNodes();
        const edges = analyzer.getEdges();
        let content;
        if (format === "mermaid") {
            content = analyzer.toMermaid();
        }
        else {
            content = JSON.stringify({
                directory: lastKey,
                nodes: nodes.map((n) => ({ id: n.id, kind: n.kind, label: n.label, filePath: n.filePath })),
                edges: edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, label: e.label })),
            }, null, 2);
        }
        return {
            contents: [{
                    uri: uri.href,
                    text: content,
                }],
        };
    });
}
//# sourceMappingURL=resources.js.map