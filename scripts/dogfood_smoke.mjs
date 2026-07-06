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

  if (toolNames.includes("hello")) {
    const result = await client.callTool({
      name: "hello",
      arguments: { name: "smoke-test" },
    });
    console.log("hello result:", result.content[0].text);
  }

  console.log("Smoke test PASSED");
  await client.close();
}

run().catch(async (error) => {
  console.error("Smoke test FAILED:", error instanceof Error ? error.stack ?? error.message : String(error));
  try { await client.close(); } catch {}
  process.exit(1);
});
