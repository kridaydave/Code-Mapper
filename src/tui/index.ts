#!/usr/bin/env node

import { select } from "@inquirer/prompts";
import chalk from "chalk";
import os from "os";
import path from "path";
import fs from "fs";

const out = (msg?: string) => process.stderr.write((msg ?? "") + "\n");

const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  muted: chalk.gray,
  bold: chalk.bold,
};

interface MCPClient {
  id: string;
  name: string;
  icon: string;
  configPath: string;
  installed: boolean;
  description: string;
}

function getPackageRoot(): string {
  const currentDir = process.cwd();
  if (fs.existsSync(path.join(currentDir, "package.json"))) {
    return currentDir;
  }
  return path.resolve(currentDir, "..");
}

function getConfigDir(clientId: string): string {
  const home = os.homedir();
  
  switch (clientId) {
    case "claude-desktop":
      if (process.platform === "win32") {
        return path.join(home, "AppData", "Roaming", "Claude");
      } else if (process.platform === "darwin") {
        return path.join(home, "Library", "Application Support", "Claude");
      }
      return path.join(home, ".config", "Claude");
    
    case "cursor":
      if (process.platform === "win32") {
        return path.join(home, "AppData", "Roaming", "Cursor", "User", "globalStorage");
      } else if (process.platform === "darwin") {
        return path.join(home, "Library", "Application Support", "Cursor", "User", "globalStorage");
      }
      return path.join(home, ".config", "Cursor", "User", "globalStorage");
    
    case "gemini-cli":
      if (process.platform === "win32") {
        return path.join(home, "AppData", "Roaming", "gemini-cli", "settings");
      } else if (process.platform === "darwin") {
        return path.join(home, "Library", "Application Support", "gemini-cli");
      }
      return path.join(home, ".config", "gemini-cli");
    
    case "claude-code":
      return path.join(home, ".claude");
    
    case "opencode":
      return path.join(home, ".opencode");
    
    default:
      return home;
  }
}

function getMcpConfigPath(clientId: string): string {
  const configDir = getConfigDir(clientId);
  
  switch (clientId) {
    case "claude-desktop":
      return path.join(configDir, "settings.json");
    case "cursor":
      return path.join(configDir, "mcp.json");
    case "gemini-cli":
      return path.join(configDir, "config.json");
    case "claude-code":
      return path.join(configDir, "settings.json");
    case "opencode":
      return path.join(configDir, "settings.json");
    default:
      return path.join(configDir, "mcp.json");
  }
}

function detectClients(): MCPClient[] {
  const clients: MCPClient[] = [
    {
      id: "claude-desktop",
      name: "Claude Desktop",
      icon: "🧠",
      configPath: getMcpConfigPath("claude-desktop"),
      installed: false,
      description: "Desktop app from Anthropic",
    },
    {
      id: "cursor",
      name: "Cursor",
      icon: "📝",
      configPath: getMcpConfigPath("cursor"),
      installed: false,
      description: "AI-powered code editor",
    },
    {
      id: "gemini-cli",
      name: "Gemini CLI",
      icon: "🌟",
      configPath: getMcpConfigPath("gemini-cli"),
      installed: false,
      description: "Google's Gemini CLI",
    },
    {
      id: "claude-code",
      name: "Claude Code",
      icon: "💻",
      configPath: getMcpConfigPath("claude-code"),
      installed: false,
      description: "Anthropic's CLI tool",
    },
    {
      id: "opencode",
      name: "Opencode",
      icon: "🔓",
      configPath: getMcpConfigPath("opencode"),
      installed: false,
      description: "AI coding assistant",
    },
  ];

  for (const client of clients) {
    const configDir = getConfigDir(client.id);
    try {
      client.installed = fs.existsSync(configDir) || fs.existsSync(path.dirname(configDir));
    } catch {
      client.installed = false;
    }
  }

  return clients;
}

function printWelcomeBanner(): void {
  console.clear();
  out(colors.primary.bold("╔════════════════════════════════════════════════════════════════╗"));
  out(colors.primary.bold("║                                                                ║"));
  out(colors.primary.bold("║                  📊 CodeMapper MCP Server                    ║"));
  out(colors.primary.bold("║                                                                ║"));
  out(colors.primary.bold("║      Analyze and visualize your codebase with AI assistance    ║"));
  out(colors.primary.bold("║                                                                ║"));
  out(colors.primary.bold("╚════════════════════════════════════════════════════════════════╝"));
  out();
}

function printSuccess(message: string): void {
  out(colors.success(`  ✓ ${message}`));
}

function printError(message: string): void {
  out(colors.error(`  ✗ ${message}`));
}

function printInfo(message: string): void {
  out(colors.info(`  ℹ ${message}`));
}

function writeClientConfig(client: MCPClient): boolean {
  try {
    const configDir = path.dirname(client.configPath);
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    let existingConfig: { mcpServers?: Record<string, unknown> } = {};
    
    if (fs.existsSync(client.configPath)) {
      try {
        const content = fs.readFileSync(client.configPath, "utf-8");
        existingConfig = JSON.parse(content);
      } catch {
        existingConfig = {};
      }
    }

    if (!existingConfig.mcpServers) {
      existingConfig.mcpServers = {};
    }

    existingConfig.mcpServers["code-mapper"] = {
      command: "npx",
      args: ["code-mapper"],
    };

    fs.writeFileSync(client.configPath, JSON.stringify(existingConfig, null, 2));
    return true;
  } catch (error) {
    return false;
  }
}

export async function startSetupWizard(): Promise<void> {
  printWelcomeBanner();

  out(colors.bold("Detecting AI clients..."));
  out();

  const clients = detectClients();
  const installedClients = clients.filter((c) => c.installed);

  if (installedClients.length === 0) {
    out(colors.warning("  No AI clients detected on your system."));
    out(colors.muted("  CodeMapper will work when you configure it manually."));
    out();
    out(colors.info("  To configure manually, add to your MCP config:"));
    out(colors.primary('    { "mcpServers": { "code-mapper": { "command": "npx", "args": ["code-mapper"] } } }'));
    out();
    return;
  }

  out(colors.success(`  Found ${installedClients.length} client(s):`));
  for (const client of installedClients) {
    out(colors.success(`    ${client.icon} ${client.name}`));
  }
  out();

  const clientOptions = installedClients.map((client) => ({
    name: `${client.icon} ${client.name}`,
    value: client.id,
    description: client.description,
  }));

  const selectedClientId = await select({
    message: "Select a client to configure:",
    choices: clientOptions,
  });

  if (!selectedClientId) {
    out(colors.warning("  No client selected."));
    return;
  }

  const client = clients.find((c) => c.id === selectedClientId);
  if (client) {
    const success = writeClientConfig(client);
    if (success) {
      out();
      printSuccess(`${client.icon} ${client.name} configured`);
      printInfo(`  Config written to: ${client.configPath}`);
    } else {
      out();
      printError(`${client.icon} ${client.name} - failed to write config`);
    }
  }

  out();
  out(colors.success.bold("🎉 Setup Complete!"));
  out();
  out(colors.muted("Your CodeMapper is ready. You can:"));
  out();
  out(colors.info("  1. Restart your AI client"));
  out(colors.info('  2. Say: "Scan my codebase" or "Show me the dependency graph"'));
  out();
  out(colors.muted("To re-run this setup anytime:"));
  out(colors.primary("  npx code-mapper --setup"));
  out();
}

export default { startSetupWizard };