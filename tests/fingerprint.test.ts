import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compareFingerprints, generateFingerprint, loadFingerprint, storeFingerprint } from "../src/core/fingerprint.js";
import { evaluateInstallGateFromMetadata } from "../src/core/installGate.js";

import playwrightFixture from "./fixtures/playwright-mcp.json";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "mtg-"));
  process.env.MCP_TRUST_GATE_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.MCP_TRUST_GATE_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("generateFingerprint", () => {
  it("produces correct structure from an InstallGateResult", () => {
    const result = evaluateInstallGateFromMetadata(playwrightFixture);
    const fingerprint = generateFingerprint(result);

    expect(fingerprint.package).toBe("@playwright/mcp");
    expect(fingerprint.version).toBe("0.0.70");
    expect(fingerprint.verdict).toBe("REVIEW");
    expect(fingerprint.accessDomain).toBe("browser automation");
    expect(fingerprint.checks.length).toBe(9);
    expect(typeof fingerprint.generatedAt).toBe("string");
  });
});

describe("compareFingerprints", () => {
  it("detects drift when access_domain changes", () => {
    const result = evaluateInstallGateFromMetadata(playwrightFixture);
    const baseline = generateFingerprint(result);
    const current = { ...baseline, accessDomain: "database access" };

    const drift = compareFingerprints(baseline, current);

    expect(drift.driftDetected).toBe(true);
    expect(drift.diff?.changed).toContain("access_domain");
  });

  it("returns no drift when fingerprints are identical", () => {
    const result = evaluateInstallGateFromMetadata(playwrightFixture);
    const fingerprint = generateFingerprint(result);

    const drift = compareFingerprints(fingerprint, fingerprint);

    expect(drift.driftDetected).toBe(false);
    expect(drift.diff).toBeNull();
  });
});

describe("storeFingerprint + loadFingerprint", () => {
  it("round-trips a fingerprint through disk", async () => {
    const result = evaluateInstallGateFromMetadata(playwrightFixture);
    const fingerprint = generateFingerprint(result);

    await storeFingerprint(fingerprint);
    const loaded = await loadFingerprint("@playwright/mcp");

    expect(loaded).toEqual(fingerprint);
  });

  it("returns null when no baseline exists", async () => {
    const loaded = await loadFingerprint("never-stored-package");
    expect(loaded).toBeNull();
  });
});
