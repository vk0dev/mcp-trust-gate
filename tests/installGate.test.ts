import { describe, expect, it } from "vitest";

import { evaluateInstallGate, evaluateInstallGateFromMetadata } from "../src/core/installGate.js";
import { renderVerdictCard } from "../src/core/render.js";
import type { MetadataClient, TargetMetadata } from "../src/core/types.js";

import filesystemFixture from "./fixtures/server-filesystem.json";
import playwrightFixture from "./fixtures/playwright-mcp.json";
import remoteFixture from "./fixtures/mcp-remote.json";

const cases = [
  {
    name: "@modelcontextprotocol/server-filesystem",
    fixture: filesystemFixture,
    expectedReason: "Trust-relevant access domain: filesystem access.",
    expectedAccess: "filesystem access",
  },
  {
    name: "@playwright/mcp",
    fixture: playwrightFixture,
    expectedReason: "Trust-relevant access domain: browser automation.",
    expectedAccess: "browser automation",
  },
  {
    name: "mcp-remote",
    fixture: remoteFixture,
    expectedReason: "Trust-relevant access domain: network or remote system access.",
    expectedAccess: "network or remote system access",
  },
] as const satisfies Array<{
  name: string;
  fixture: TargetMetadata;
  expectedReason: string;
  expectedAccess: string;
}>;

describe("install gate proof", () => {
  it.each(cases)("evaluates %s with deterministic REVIEW verdict", ({ fixture, expectedReason, expectedAccess }) => {
    const result = evaluateInstallGateFromMetadata(fixture);

    expect(result.target).toBe(fixture.target);
    expect(result.verdict).toBe("REVIEW");
    expect(result.targetType).toBe("npm");
    expect(result.checks.map((check) => check.key)).toEqual([
      "target_resolvable",
      "source_traceable",
      "maintenance_state",
      "access_domain",
      "secrets_required",
      "mutation_capability",
      "persistence",
      "deployment_clarity",
      "disclosure_quality",
    ]);
    expect(result.reasons).toContain(expectedReason);
    expect(result.evidence.length).toBeGreaterThanOrEqual(2);
    expect(result.summary).toContain("REVIEW:");

    const accessCheck = result.checks.find((check) => check.key === "access_domain");
    expect(accessCheck?.signal).toBe(expectedAccess);
  });

  it("flags persistence-heavy packages for manual review", () => {
    const result = evaluateInstallGateFromMetadata({
      target: "memory-mcp",
      packageMetadata: {
        name: "memory-mcp",
        version: "1.0.0",
        description: "Persistent memory server for retaining notes and project context across sessions",
        repository: "https://github.com/example/memory-mcp",
        homepage: "https://github.com/example/memory-mcp#readme",
        keywords: ["mcp", "memory", "persistence"],
        dependencies: { zod: "^3.0.0" },
        publishedAt: new Date().toISOString(),
      },
      githubRepo: {
        fullName: "example/memory-mcp",
        htmlUrl: "https://github.com/example/memory-mcp",
        archived: false,
        pushedAt: new Date().toISOString(),
      },
    });

    expect(result.verdict).toBe("REVIEW");
    expect(result.reasons).toContain("Persistence, retained artifacts, or cache review needed: retained state, caches, indexes, or artifacts.");
    expect(result.checks.find((check) => check.key === "persistence")?.status).toBe("warn");
  });

  it("flags credentialed packages for manual review", () => {
    const result = evaluateInstallGateFromMetadata({
      target: "slack-bridge-mcp",
      packageMetadata: {
        name: "slack-bridge-mcp",
        version: "1.0.0",
        description: "Slack workspace bridge that requires OAuth token setup",
        repository: "https://github.com/example/slack-bridge-mcp",
        homepage: "https://github.com/example/slack-bridge-mcp#readme",
        keywords: ["mcp", "slack", "oauth", "token"],
        dependencies: { undici: "^7.0.0" },
        publishedAt: new Date().toISOString(),
      },
      githubRepo: {
        fullName: "example/slack-bridge-mcp",
        htmlUrl: "https://github.com/example/slack-bridge-mcp",
        archived: false,
        pushedAt: new Date().toISOString(),
      },
    });

    expect(result.verdict).toBe("REVIEW");
    expect(result.reasons).toContain("Secrets or external credentials required: external credentials required.");
    expect(result.checks.find((check) => check.key === "secrets_required")?.status).toBe("warn");
  });

  it("flags mutation-capable packages for manual review", () => {
    const result = evaluateInstallGateFromMetadata({
      target: "git-writer-mcp",
      packageMetadata: {
        name: "git-writer-mcp",
        version: "1.0.0",
        description: "Repository assistant that can modify files, create commits, and push changes",
        repository: "https://github.com/example/git-writer-mcp",
        homepage: "https://github.com/example/git-writer-mcp#readme",
        keywords: ["mcp", "git", "commit", "write"],
        dependencies: { simpleGit: "^1.0.0" },
        publishedAt: new Date().toISOString(),
      },
      githubRepo: {
        fullName: "example/git-writer-mcp",
        htmlUrl: "https://github.com/example/git-writer-mcp",
        archived: false,
        pushedAt: new Date().toISOString(),
      },
    });

    expect(result.verdict).toBe("REVIEW");
    expect(result.reasons).toContain("State-changing or interactive external action advertised: state-changing or interactive external actions advertised.");
    expect(result.checks.find((check) => check.key === "mutation_capability")?.status).toBe("warn");
  });

  it("treats read-only SaaS context access as review-worthy without any brand discount", () => {
    const result = evaluateInstallGateFromMetadata({
      target: "@cloudflare/figma-context-mcp",
      packageMetadata: {
        name: "@cloudflare/figma-context-mcp",
        version: "1.0.0",
        description: "Read-only Figma workspace context for reviewing product design files and team projects",
        repository: "https://github.com/example/figma-context-mcp",
        homepage: "https://github.com/example/figma-context-mcp#readme",
        keywords: ["mcp", "figma", "workspace", "read-only"],
        dependencies: { undici: "^7.0.0" },
        publishedAt: new Date().toISOString(),
      },
      githubRepo: {
        fullName: "example/figma-context-mcp",
        htmlUrl: "https://github.com/example/figma-context-mcp",
        archived: false,
        pushedAt: new Date().toISOString(),
      },
    });

    expect(result.verdict).toBe("REVIEW");
    expect(result.reasons).toContain("Trust-relevant access domain: high-sensitivity saas or workspace context.");
    expect(result.reasons).not.toContain("Trusted vendor branding reduces review needs.");
    expect(result.checks.find((check) => check.key === "mutation_capability")?.status).toBe("pass");
  });

  it("reviews technically true but under-framed disclosure as its own first-class cue", () => {
    const result = evaluateInstallGateFromMetadata({
      target: "cloudflare-api-mcp",
      packageMetadata: {
        name: "cloudflare-api-mcp",
        version: "1.0.0",
        description: "Token-efficient helper for the entire Cloudflare API",
        repository: "https://github.com/example/cloudflare-api-mcp",
        homepage: "https://github.com/example/cloudflare-api-mcp#readme",
        keywords: ["mcp", "cloudflare", "api", "helper"],
        dependencies: { undici: "^7.0.0" },
        publishedAt: new Date().toISOString(),
      },
      githubRepo: {
        fullName: "example/cloudflare-api-mcp",
        htmlUrl: "https://github.com/example/cloudflare-api-mcp",
        archived: false,
        pushedAt: new Date().toISOString(),
      },
    });

    expect(result.verdict).toBe("REVIEW");
    expect(result.reasons).toContain("Disclosure quality needs operator review: benefit-heavy framing.");
    expect(result.checks.find((check) => check.key === "disclosure_quality")?.status).toBe("warn");
  });

  it("renders a compact human-readable verdict card", () => {
    const result = evaluateInstallGateFromMetadata(playwrightFixture);

    expect(renderVerdictCard(result)).toMatchInlineSnapshot(`
      "Verdict: REVIEW
      Target: @playwright/mcp
      Summary: REVIEW: Trust-relevant access domain: browser automation. Source traceable to microsoft/playwright-mcp.
      Why this verdict:
      - Trust-relevant access domain: browser automation.
      - Source traceable to microsoft/playwright-mcp.
      - Project shows recent maintenance activity.
      Recommended next step:
      - Confirm the exact system boundary this server can access before enablement."
    `);
  });

  it("hard-blocks archived upstreams", () => {
    const result = evaluateInstallGateFromMetadata({
      ...playwrightFixture,
      target: "@archived/example",
      githubRepo: {
        ...playwrightFixture.githubRepo,
        fullName: "example/archived-mcp",
        archived: true,
      },
    });

    expect(result.verdict).toBe("BLOCK");
    expect(result.reasons).toContain("Upstream repository is archived, so V1 install gate hard-blocks enablement.");
    expect(result.recommendedActions[0]).toBe("Do not install or enable this target until the blocking issue is resolved.");
  });

  it("blocks unresolvable package (stub client)", async () => {
    const stub: MetadataClient = {
      async fetchTarget(target) {
        return { target, packageMetadata: undefined, githubRepo: undefined };
      },
    };

    const result = await evaluateInstallGate("does-not-exist-xyz", stub);

    expect(result.verdict).toBe("BLOCK");
    expect(result.checks.find((check) => check.key === "target_resolvable")?.status).toBe("fail");
  });
});
