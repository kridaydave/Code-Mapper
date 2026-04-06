#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MIN_NODE_VERSION = 18;
const version = process.versions.node;
const major = parseInt(version.split(".")[0], 10);

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

function log(...args) { console.error(...args); }

if (major < MIN_NODE_VERSION) {
  log(`${RED}Node ${version} not supported. Need 18+.`);
  process.exit(1);
}

const pkgRoot = path.resolve(__dirname, "..");
const distIndex = path.join(pkgRoot, "dist", "index.js");

if (!fs.existsSync(distIndex)) {
  log(`${YELLOW}Building...`);
  const srcIndex = path.join(pkgRoot, "src", "index.ts");
  if (!fs.existsSync(srcIndex)) {
    log(`${RED}Source not found. Reinstall.`);
    process.exit(1);
  }
  if (fs.existsSync(path.join(pkgRoot, "node_modules", "typescript"))) {
    try {
      const { execSync } = await import("child_process");
      execSync("npm run build", { cwd: pkgRoot, stdio: "inherit" });
    } catch {
      log(`${RED}Build failed`);
      process.exit(1);
    }
  } else {
    log(`${RED}Install incomplete.`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  log(`
code-mapper v1.0.0

npx code-mapper              - start server
npx code-mapper --setup      - setup wizard
npx code-mapper --version    - show version
`);
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  log("1.0.0");
  process.exit(0);
}

if (args.includes("--setup") || args.includes("-s")) {
  const tuiDist = path.join(pkgRoot, "dist", "tui", "index.js");
  const tuiSrc = path.join(pkgRoot, "src", "tui", "index.ts");
  
  if (fs.existsSync(tuiDist)) {
    const { startSetupWizard } = await import("../dist/tui/index.js");
    await startSetupWizard();
  } else if (fs.existsSync(tuiSrc)) {
    const { execSync } = await import("child_process");
    execSync("npm run build", { cwd: pkgRoot, stdio: "inherit" });
    const { startSetupWizard } = await import("../dist/tui/index.js");
    await startSetupWizard();
  } else {
    log(`${YELLOW}Setup not available.`);
  }
  process.exit(0);
}

import("../dist/index.js").catch((err) => {
  log(`${RED}Failed: ${err.message}`);
  process.exit(1);
});