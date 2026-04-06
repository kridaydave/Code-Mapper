#!/usr/bin/env node

import fs from "fs";
import path from "path";

const MIN_NODE_VERSION = 18;
const nodeVersion = process.versions.node;
const major = parseInt(nodeVersion.split(".")[0], 10);

const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";

function log(...args: unknown[]) { console.error(...args); }

function err(...args: unknown[]) { console.error(...args); }

if (major < MIN_NODE_VERSION) {
  err(`${RED}${BOLD}Node ${nodeVersion} not supported. Need 18+.`);
  process.exit(1);
}

const pkgRoot = process.cwd();
const distIndex = path.join(pkgRoot, "dist", "index.js");

if (!fs.existsSync(distIndex)) {
  log(`${YELLOW}Building...`);
  const srcIndex = path.join(pkgRoot, "src", "index.ts");
  if (!fs.existsSync(srcIndex)) {
    err(`${RED}Source not found. Reinstall.`);
    process.exit(1);
  }

  if (fs.existsSync(path.join(pkgRoot, "node_modules", "typescript"))) {
    try {
      const { execSync } = await import("child_process");
      execSync("npm run build", { cwd: pkgRoot, stdio: "inherit" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      err(`${RED}Build failed: ${msg}`);
      process.exit(1);
    }
  } else {
    err(`${RED}Install incomplete. Reinstall.`);
    process.exit(1);
  }
}

const nodeModules = path.join(pkgRoot, "node_modules");
const missing = ["@modelcontextprotocol/sdk", "chalk", "zod"].filter(
  d => !fs.existsSync(path.join(nodeModules, d))
);

if (missing.length) {
  err(`${RED}Missing: ${missing.join(", ")}`);
  err(`Run: npm install`);
  process.exit(1);
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  log(`
code-mapper v1.0.1

npx code-mapper      - start server
npx code-mapper --setup  - setup wizard
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  log("1.0.1");
  process.exit(0);
}

if (args.includes("--setup") || args.includes("-s")) {
  const tuiDist = path.join(pkgRoot, "dist", "tui", "index.js");
  const tuiSrc = path.join(pkgRoot, "src", "tui", "index.ts");
  
  if (fs.existsSync(tuiDist)) {
    const { startSetupWizard } = await import("./tui/index.js");
    await startSetupWizard();
  } else if (fs.existsSync(tuiSrc)) {
    log(`${YELLOW}Building...`);
    const { execSync } = await import("child_process");
    execSync("npm run build", { cwd: pkgRoot, stdio: "inherit" });
    const { startSetupWizard } = await import("./tui/index.js");
    await startSetupWizard();
  } else {
    log(`${YELLOW}Setup not available.`);
  }
  process.exit(0);
} else {
  const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
  const { McpServer } = await import("@modelcontextprotocol/sdk/server/mcp.js");
  const { registerTools } = await import("./mcp/tools.js");
  const { registerResources } = await import("./mcp/resources.js");

  const server = new McpServer(
    { name: "code-mapper", version: "1.0.1" },
    { instructions: "CodeMapper analyzes TypeScript/JavaScript codebases. Start with scan_codebase." }
  );

  registerTools(server);
  registerResources(server);

  const transport = new StdioServerTransport();

  transport.onerror = (e) => log(`Error: ${e.message}`);
  transport.onclose = () => { log("Closed"); process.exit(0); };

  try {
    await server.connect(transport);
    log("CodeMapper running on stdio");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    err(`${RED}Failed: ${msg}`);
    process.exit(1);
  }

  process.on("SIGINT", () => { log("Shutting down..."); process.exit(0); });
  process.on("SIGTERM", () => { log("Shutting down..."); process.exit(0); });
}