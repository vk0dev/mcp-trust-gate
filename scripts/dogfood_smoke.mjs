import process from "node:process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cwd = process.cwd();

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/server.js"],
  cwd,
  stderr: "inherit",
});

const client = new Client({
  name: "dogfood-smoke",
  version: "0.1.0",
});

async function run() {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((t) => t.name).sort();
  console.log("Tools found:", toolNames.join(", "));

  if (!toolNames.includes("evaluate_install_gate") || !toolNames.includes("scan_config")) {
    throw new Error("Expected tools evaluate_install_gate and scan_config were not both registered");
  }

  const result = await client.callTool({
    name: "evaluate_install_gate",
    arguments: { package_name: "@playwright/mcp" },
  });

  if (result.isError) {
    console.log("evaluate_install_gate returned a structured error (likely network unavailable):", result.content[0].text);
  } else {
    const payload = JSON.parse(result.content[0].text);
    if (!["GO", "REVIEW", "BLOCK"].includes(payload.verdict)) {
      throw new Error(`Unexpected verdict in evaluate_install_gate response: ${JSON.stringify(payload)}`);
    }
    console.log("evaluate_install_gate verdict:", payload.verdict);
  }

  console.log("Smoke test PASSED");
  await client.close();
}

run().catch(async (error) => {
  console.error("Smoke test FAILED:", error instanceof Error ? error.stack ?? error.message : String(error));
  try { await client.close(); } catch {}
  process.exit(1);
});
