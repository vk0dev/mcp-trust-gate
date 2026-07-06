import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { MetadataClient, TargetMetadata } from "../src/core/types.js";
import { extractPackageName, parseMcpConfig, scanConfig } from "../src/tools/scanConfig.js";

import playwrightFixture from "./fixtures/playwright-mcp.json";
import remoteFixture from "./fixtures/mcp-remote.json";

const fakeClient: MetadataClient = {
  async fetchTarget(target: string): Promise<TargetMetadata> {
    if (target === "@playwright/mcp") return playwrightFixture;
    if (target === "mcp-remote") return remoteFixture;
    return { target, packageMetadata: undefined, githubRepo: undefined };
  },
};

describe("extractPackageName", () => {
  it("extracts a scoped package name from npx args", () => {
    expect(extractPackageName("npx", ["-y", "@playwright/mcp"])).toBe("@playwright/mcp");
  });

  it("strips a version tag from an unscoped package", () => {
    expect(extractPackageName("npx", ["-y", "mcp-remote@1.2.3"])).toBe("mcp-remote");
  });

  it("strips a version tag from a scoped package", () => {
    expect(extractPackageName("npx", ["-y", "@playwright/mcp@0.0.70"])).toBe("@playwright/mcp");
  });

  it("returns null for non-npx commands", () => {
    expect(extractPackageName("docker", ["run", "some-image"])).toBeNull();
    expect(extractPackageName("python", ["server.py"])).toBeNull();
  });
});

describe("parseMcpConfig", () => {
  it("parses a .mcp.json format config with multiple servers", () => {
    const config = JSON.stringify({
      mcpServers: {
        playwright: { command: "npx", args: ["-y", "@playwright/mcp"] },
        remote: { command: "npx", args: ["-y", "mcp-remote"] },
      },
    });

    const parsed = parseMcpConfig(config);

    expect(parsed).toEqual([
      { name: "playwright", package: "@playwright/mcp", skipped: false },
      { name: "remote", package: "mcp-remote", skipped: false },
    ]);
  });

  it("parses a claude_desktop_config.json format config", () => {
    const config = JSON.stringify({
      mcpServers: {
        playwright: { command: "npx", args: ["-y", "@playwright/mcp"] },
      },
    });

    const parsed = parseMcpConfig(config);

    expect(parsed).toEqual([{ name: "playwright", package: "@playwright/mcp", skipped: false }]);
  });

  it("skips non-npx servers", () => {
    const config = JSON.stringify({
      mcpServers: {
        dockerized: { command: "docker", args: ["run", "some-image"] },
      },
    });

    const parsed = parseMcpConfig(config);

    expect(parsed).toEqual([
      { name: "dockerized", package: null, skipped: true, skipReason: "non-npm or unresolvable server" },
    ]);
  });

  it("treats a missing mcpServers key as zero servers", () => {
    expect(parseMcpConfig(JSON.stringify({}))).toEqual([]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseMcpConfig("{ bad json")).toThrow();
  });
});

describe("scanConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mtg-scan-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("evaluates each server and produces summary counts", async () => {
    const configPath = path.join(tmpDir, ".mcp.json");
    await fs.writeFile(
      configPath,
      JSON.stringify({
        mcpServers: {
          playwright: { command: "npx", args: ["-y", "@playwright/mcp"] },
          remote: { command: "npx", args: ["-y", "mcp-remote"] },
          dockerized: { command: "docker", args: ["run", "some-image"] },
        },
      }),
    );

    const result = await scanConfig(configPath, fakeClient);

    expect(result.summary.total).toBe(3);
    expect(result.summary.review).toBe(2);
    expect(result.summary.skipped).toBe(1);
    expect(result.servers.find((s) => s.name === "playwright")?.verdict).toBe("REVIEW");
    expect(result.servers.find((s) => s.name === "dockerized")?.verdict).toBe("SKIPPED");
  });

  it("throws when the config file does not exist", async () => {
    await expect(scanConfig("/no/such/file.json", fakeClient)).rejects.toThrow();
  });
});
