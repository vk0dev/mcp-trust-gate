import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CheckKey, DriftResult, Fingerprint, InstallGateResult } from "./types.js";

// MCP_TRUST_GATE_DIR overrides the storage root (used by tests to avoid touching the real home directory).
function baseDir(): string {
  return process.env.MCP_TRUST_GATE_DIR ?? path.join(os.homedir(), ".mcp-trust-gate");
}

function fingerprintsDir(): string {
  return path.join(baseDir(), "fingerprints");
}

function fileNameFor(pkg: string): string {
  return `${pkg.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`;
}

export function generateFingerprint(result: InstallGateResult): Fingerprint {
  const signalFor = (key: CheckKey): string =>
    result.checks.find((check) => check.key === key)?.signal ?? "unknown";

  const resolvable = result.checks.find((check) => check.key === "target_resolvable");
  let version = "unknown";
  if (resolvable?.status === "pass" && resolvable.signal.includes("@")) {
    version = resolvable.signal.slice(resolvable.signal.lastIndexOf("@") + 1);
  }

  return {
    package: result.target,
    version,
    generatedAt: new Date().toISOString(),
    checks: result.checks.map((check) => ({ key: check.key, status: check.status, signal: check.signal })),
    verdict: result.verdict,
    accessDomain: signalFor("access_domain"),
    mutationCapability: signalFor("mutation_capability"),
    secretsRequired: signalFor("secrets_required"),
    persistence: signalFor("persistence"),
  };
}

export async function storeFingerprint(fingerprint: Fingerprint): Promise<void> {
  await fs.mkdir(fingerprintsDir(), { recursive: true });
  const filePath = path.join(fingerprintsDir(), fileNameFor(fingerprint.package));
  await fs.writeFile(filePath, JSON.stringify(fingerprint, null, 2), "utf8");
}

export async function loadFingerprint(packageName: string): Promise<Fingerprint | null> {
  const filePath = path.join(fingerprintsDir(), fileNameFor(packageName));
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as Fingerprint;
  } catch {
    return null;
  }
}

export function compareFingerprints(baseline: Fingerprint, current: Fingerprint): DriftResult {
  const fields: Array<[keyof Fingerprint, string]> = [
    ["accessDomain", "access_domain"],
    ["mutationCapability", "mutation_capability"],
    ["secretsRequired", "secrets_required"],
    ["persistence", "persistence"],
  ];

  const changed: string[] = [];
  for (const [field, label] of fields) {
    if (baseline[field] !== current[field]) {
      changed.push(label);
    }
  }

  if (changed.length === 0) {
    return { driftDetected: false, diff: null };
  }

  return { driftDetected: true, diff: { changed, baseline, current } };
}

export async function evaluateWithFingerprint(
  result: InstallGateResult,
): Promise<{ fingerprint: Fingerprint; drift: DriftResult }> {
  const current = generateFingerprint(result);
  const baseline = await loadFingerprint(result.target);
  const drift: DriftResult = baseline ? compareFingerprints(baseline, current) : { driftDetected: false, diff: null };
  await storeFingerprint(current);
  return { fingerprint: current, drift };
}
