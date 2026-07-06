import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerTools(server: McpServer): void {
  server.registerTool(
    "hello",
    {
      description:
        "Returns a greeting message to verify the server is running and reachable. " +
        "Use this tool to test connectivity — does NOT perform any real work. " +
        "Replace with actual domain-specific tools before publishing.",
      inputSchema: {
        name: z.string().describe("Name to include in the greeting message"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ name }) => ({
      content: [{ type: "text", text: JSON.stringify({ greeting: `Hello, ${name}!` }, null, 2) }],
    }),
  );

  // TODO: Replace hello tool with real domain-specific tools
  // See: ~/.hermes/workspace/shared/knowledge/mcp-tool-design-guide.md (migrated from OpenClaw)
}
