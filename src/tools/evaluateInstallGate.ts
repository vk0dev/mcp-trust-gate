import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { evaluateWithFingerprint } from "../core/fingerprint.js";
import { evaluateInstallGate } from "../core/installGate.js";
import { LiveMetadataClient } from "../core/metadataClient.js";

export function registerEvaluateInstallGateTool(server: McpServer): void {
  server.registerTool(
    "evaluate_install_gate",
    {
      description:
        "Evaluate an npm-based MCP server before install or enablement. Returns a GO/REVIEW/BLOCK verdict " +
        "with evidence explaining the trust posture. Checks: target resolution, source traceability, " +
        "maintenance state, access domain, secrets required, mutation capability, persistence, deployment " +
        "clarity, disclosure quality. Use before installing any MCP server to understand what systems it " +
        "can access and what actions it can take.",
      inputSchema: {
        package_name: z
          .string()
          .describe("The npm package name of the MCP server to evaluate, e.g. @playwright/mcp or mcp-remote"),
      },
      annotations: { readOnlyHint: true },
    },
    async ({ package_name }) => {
      try {
        const result = await evaluateInstallGate(package_name, new LiveMetadataClient());
        const { fingerprint, drift } = await evaluateWithFingerprint(result);

        const payload = {
          verdict: result.verdict,
          summary: result.summary,
          target: result.target,
          targetType: result.targetType,
          checks: result.checks,
          reasons: result.reasons,
          recommendedActions: result.recommendedActions,
          evidence: result.evidence,
          fingerprint,
          driftDetected: drift.driftDetected,
          drift: drift.diff,
        };

        return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: message, package: package_name }, null, 2) }],
          isError: true,
        };
      }
    },
  );
}
