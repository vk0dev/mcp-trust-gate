import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { registerEvaluateInstallGateTool } from "./evaluateInstallGate.js";
import { registerScanConfigTool } from "./scanConfig.js";

export function registerTools(server: McpServer): void {
  registerEvaluateInstallGateTool(server);
  registerScanConfigTool(server);
}
