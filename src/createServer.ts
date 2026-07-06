import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerTools } from "./tools/index.js";

export function createServer(): McpServer {
  const server = new McpServer(
    {
      name: "mcp-trust-gate",
      version: "1.0.0",
      description: "Pre-install trust gate for MCP servers — GO/REVIEW/BLOCK verdict with evidence",
    },
    {
      instructions:
        "Pre-install trust gate for MCP servers. Use evaluate_install_gate to check an npm MCP package " +
        "before installing it. Use scan_config to audit all MCP servers in your Claude Code or Claude " +
        "Desktop config file. Both return GO/REVIEW/BLOCK verdicts with evidence.",
    },
  );
  registerTools(server);
  return server;
}

// Smithery requires this export for server scanning
export const createSandboxServer = createServer;
