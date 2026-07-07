import { afterEach, describe, expect, it, vi } from "vitest";

import { evaluateInstallGate } from "../src/core/installGate.js";
import { LiveMetadataClient } from "../src/core/metadataClient.js";

describe("LiveMetadataClient npm 404 handling", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns a structured BLOCK when the npm registry responds 404", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await evaluateInstallGate(
      "definitely-not-a-real-package-mtg-xyz-planned",
      new LiveMetadataClient(),
    );

    expect(result.verdict).toBe("BLOCK");
    expect(result.checks.find((check) => check.key === "target_resolvable")?.status).toBe("fail");
    // 404 short-circuits before any GitHub lookup, so only npm is queried.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still throws for non-404 registry failures (e.g. rate limiting)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));

    await expect(
      evaluateInstallGate("rate-limited-pkg-mtg-xyz-planned", new LiveMetadataClient()),
    ).rejects.toThrow(/429/);
  });
});
