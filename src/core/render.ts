import type { InstallGateResult } from "./types.js";

export function renderVerdictCard(result: InstallGateResult): string {
  const lines = [
    `Verdict: ${result.verdict}`,
    `Target: ${result.target}`,
    `Summary: ${result.summary}`,
    "Why this verdict:",
    ...result.reasons.map((reason) => `- ${reason}`),
  ];

  if (result.recommendedActions.length > 0) {
    lines.push("Recommended next step:");
    lines.push(...result.recommendedActions.map((action) => `- ${action}`));
  }

  return lines.join("\n");
}
