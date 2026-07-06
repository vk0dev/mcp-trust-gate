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
        "TODO: Describe how to use this server effectively. " +
        "Include which tools to call first and in what order.",
    },
  );
  registerTools(server);
  return server;
}

// Smithery requires this export for server scanning
export const createSandboxServer = createServer;
