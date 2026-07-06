import { promises as fs } from "node:fs";
import path from "node:path";

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { evaluateInstallGate } from "../core/installGate.js";
import { LiveMetadataClient } from "../core/metadataClient.js";
import type { MetadataClient, Verdict } from "../core/types.js";

export interface ParsedServer {
  name: string;
  package: string | null;
  skipped: boolean;
  skipReason?: string;
}

export interface ScanServerResult {
  name: string;
  package: string | null;
  verdict: Verdict | "SKIPPED";
  summary: string;
}

export interface ScanResult {
  servers: ScanServerResult[];
  summary: { total: number; go: number; review: number; block: number; skipped: number };
}

export function extractPackageName(command: string, args: string[]): string | null {
  const commandName = path.basename(command);
  if (commandName !== "npx") {
    return null;
  }

  for (const arg of args) {
    if (arg.startsWith("-")) continue;
    if (arg.includes("://")) continue;
    if (arg.startsWith(".") || arg.startsWith("/") || arg.startsWith("~")) continue;

    const isScoped = arg.startsWith("@");
    const isPlainPackage = /^[a-z0-9][a-z0-9._-]*(@[a-z0-9][a-z0-9._-]*)?$/i.test(arg);
    if (!isScoped && !isPlainPackage) continue;

    if (isScoped) {
      const at = arg.indexOf("@", 1);
      return at === -1 ? arg : arg.slice(0, at);
    }

    const at = arg.indexOf("@");
    return at === -1 ? arg : arg.slice(0, at);
  }

  return null;
}

export function parseMcpConfig(content: string): ParsedServer[] {
  const parsed = JSON.parse(content) as { mcpServers?: Record<string, unknown> };
  const mcpServers = parsed.mcpServers ?? {};

  return Object.entries(mcpServers).map(([name, rawConfig]) => {
    const cfg = (rawConfig ?? {}) as { command?: unknown; args?: unknown };
    const command = String(cfg.command ?? "");
    const args = Array.isArray(cfg.args) ? cfg.args.map(String) : [];
    const pkg = extractPackageName(command, args);

    if (!pkg) {
      return { name, package: null, skipped: true, skipReason: "non-npm or unresolvable server" };
    }

    return { name, package: pkg, skipped: false };
  });
}

export async function scanConfig(configPath: string, client: MetadataClient): Promise<ScanResult> {
  const content = await fs.readFile(configPath, "utf8");
  const parsed = parseMcpConfig(content);

  const servers: ScanServerResult[] = [];
  let go = 0;
  let review = 0;
  let block = 0;
  let skipped = 0;

  for (const server of parsed) {
    if (server.skipped || !server.package) {
      servers.push({ name: server.name, package: server.package, verdict: "SKIPPED", summary: server.skipReason ?? "skipped" });
      skipped++;
      continue;
    }

    try {
      const result = await evaluateInstallGate(server.package, client);
      servers.push({ name: server.name, package: server.package, verdict: result.verdict, summary: result.summary });
      if (result.verdict === "GO") go++;
      else if (result.verdict === "REVIEW") review++;
      else block++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      servers.push({ name: server.name, package: server.package, verdict: "SKIPPED", summary: `evaluation failed: ${message}` });
      skipped++;
    }
  }

  return { servers, summary: { total: parsed.length, go, review, block, skipped } };
}

export function registerScanConfigTool(server: McpServer): void {
  server.registerTool(
    "scan_config",
    {
      description:
        "Scan an MCP client configuration file (.mcp.json or claude_desktop_config.json) and evaluate every " +
        "installed MCP server. Returns a batch verdict summary with per-server GO/REVIEW/BLOCK verdicts. Use " +
        "to audit which MCP servers in your config need review before next session.",
      inputSchema: {
        config_path: z
          .string()
          .describe("Absolute or relative path to the MCP client config file to scan (.mcp.json or claude_desktop_config.json)"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ config_path }) => {
      try {
        const result = await scanConfig(config_path, new LiveMetadataClient());
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message, config_path }, null, 2) }],
          isError: true,
        };
      }
    },
  );
}
