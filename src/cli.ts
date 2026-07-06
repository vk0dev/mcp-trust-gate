#!/usr/bin/env node
import process from "node:process";

import { evaluateInstallGate } from "./core/installGate.js";
import { LiveMetadataClient } from "./core/metadataClient.js";
import { renderVerdictCard } from "./core/render.js";

const args = process.argv.slice(2);
const [target, ...flags] = args;

if (!target) {
  await import("./server.js");
} else if (target === "--help" || target === "-h") {
  console.log(`mcp-trust-gate — pre-install trust gate for MCP servers

Usage:
  mcp-trust-gate                 Start the MCP stdio server
  mcp-trust-gate <npm-package>   Print GO/REVIEW/BLOCK verdict JSON
  mcp-trust-gate <pkg> --card    Print the human-readable verdict card`);
} else {
  try {
    const result = await evaluateInstallGate(target, new LiveMetadataClient());
    console.log(flags.includes("--card") ? renderVerdictCard(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
