# PRD: MCP Trust Gate

**Status:** approved
**Date:** 2026-07-06
**Product:** #4 in @vk0 Agent DevTools Suite
**npm package:** `@vk0/mcp-trust-gate`
**GitHub:** `vk0dev/mcp-trust-gate`

---

## Problem Statement (North Star)

Agent developers install MCP servers from npm, GitHub, and marketplaces into their tools (Claude Code, Claude Desktop, Cursor, Windsurf, Cline, CI). Each install exposes the agent to filesystem, shell, network, secrets, browser, databases, payments, or production APIs. There is no single tool that answers: **"Should I allow this specific MCP package/config/server right now, and what evidence explains the verdict?"**

Broad security scanners (Snyk, Cisco, Stacklok, Prismor) produce reports and scorecards. Package managers (getmcpm) trust-score as a secondary feature. Runtime middleware (mcp-trust-guard, Prismor) enforces after install. Fingerprint libraries (mintmark) detect drift but don't produce operator-facing verdicts. **The gap is a pre-install, cross-client GO/REVIEW/BLOCK verdict with evidence.**

---

## Scope Boundaries

### In scope (V1)

1. **MCP server** (`@vk0/mcp-trust-gate`): exposes `evaluate_install_gate` tool that accepts an npm package name and returns a structured verdict.

2. **9 V1 checks** (ported from proof artifact):
   - `target_resolvable` — does the npm package resolve?
   - `source_traceable` — does it map to a public GitHub repo?
   - `maintenance_state` — is the upstream archived or stale (>180 days)?
   - `access_domain` — what system can the model touch? (filesystem, database, browser, network, SaaS, infra, etc.)
   - `secrets_required` — does install require external credentials/tokens?
   - `mutation_capability` — does it advertise state-changing/interactive external actions?
   - `persistence` — does it retain artifacts, caches, transcripts, or durable state?
   - `deployment_clarity` — are deployment assumptions low-ambiguity?
   - `disclosure_quality` — is the metadata benefit-heavy or under-framing trust cues?

3. **Verdict output:**
   - `GO` — low-ambiguity, safe to proceed with normal install flow
   - `REVIEW` — identifiable but needs human judgment before enablement
   - `BLOCK` — hard-stop (unresolvable target, archived upstream, or broad trust risk + disclosure weakness)

4. **Config file scanner** (secondary tool `scan_config`):
   - Scan `.mcp.json` (Claude Code), `claude_desktop_config.json` (Claude Desktop)
   - For each installed MCP server in config, run `evaluate_install_gate`
   - Return batch verdict summary

5. **Fingerprint baseline:**
   - Each evaluation produces a structured JSON fingerprint (metadata shape + check results)
   - Stored locally as `~/.mcp-trust-gate/fingerprints/<package>.json`
   - Enables future drift detection (V2): "fingerprint changed since last evaluation"

6. **Output formats:**
   - Structured JSON (for automation/CI)
   - Human-readable verdict card (for operator)

### Out of scope (V1)

- No runtime sandbox execution
- No transitive dependency audit
- No registry-wide crawling
- No continuous monitoring or alerts
- No hosted policy packs or team allowlists (V2)
- No marketplace drift monitoring (V2)
- No known-risk corpus / threat-intel feed (V2)
- No batch evaluation dashboard
- No runtime enforcement / proxy
- No Cursor/Windsurf/Cline config parsing (V1.1 — Claude Code + Claude Desktop first)

---

## Core User Flow

### Flow 1: Pre-install evaluation (agent as buyer)

1. Agent (Claude Code, Cursor, etc.) is about to install or recommend an MCP server
2. Agent calls `evaluate_install_gate` with the npm package name (e.g., `@playwright/mcp`)
3. Server fetches npm package metadata + GitHub repo metadata
4. Server runs 9 V1 checks
5. Server returns verdict (GO/REVIEW/BLOCK) + reasons + recommended actions + evidence
6. Agent presents verdict to operator or makes autonomous decision based on policy

### Flow 2: Config audit

1. Operator asks agent: "audit my MCP config"
2. Agent calls `scan_config` with path to `.mcp.json` or `claude_desktop_config.json`
3. Server parses config, extracts installed MCP servers
4. For each server, runs `evaluate_install_gate`
5. Returns batch summary: N GO, N REVIEW, N BLOCK + per-server verdict cards
6. Operator reviews REVIEW/BLOCK items before next session

### Flow 3: Fingerprint baseline

1. First evaluation of a package stores fingerprint JSON locally
2. Subsequent evaluations compare current fingerprint to baseline
3. If fingerprint changed (new access domain, new mutation capability, etc.) → flag as drift in verdict
4. V1: drift detection is local-only (compare to last stored fingerprint)
5. V2: drift detection is hosted (historical timeline, alerts)

---

## Technical Specification

### Architecture

```
@vk0/mcp-trust-gate
├── src/
│   ├── createServer.ts       # MCP server setup, tool registration
│   ├── server.ts             # CLI entrypoint (optional)
│   ├── tools/
│   │   ├── evaluateInstallGate.ts  # Tool: evaluate_install_gate
│   │   └── scanConfig.ts           # Tool: scan_config
│   ├── core/
│   │   ├── installGate.ts          # Port from proof: 9 checks + verdict logic
│   │   ├── types.ts                # Port from proof: types + interfaces
│   │   ├── metadataClient.ts       # npm + GitHub metadata fetcher
│   │   ├── fingerprint.ts          # Fingerprint generation + storage
│   │   └── render.ts               # Verdict card rendering
│   └── index.ts
├── tests/
│   ├── installGate.test.ts         # Port from proof: fixture-based tests
│   ├── scanConfig.test.ts
│   └── fingerprint.test.ts
├── fixtures/
│   ├── playwright-mcp.json         # Real npm metadata fixture
│   ├── mcp-remote.json
│   └── archived-repo.json
├── package.json
├── server.json
└── tsconfig.json
```

### Reuse from proof artifact

The following files from `~/projects/mcp-install-gate-proof/src/` are directly portable:

| Proof file | Product file | Changes needed |
|------------|-------------|----------------|
| `installGate.ts` | `src/core/installGate.ts` | None (logic is clean) |
| `types.ts` | `src/core/types.ts` | Add fingerprint types |
| `render.ts` | `src/core/render.ts` | None |
| (metadata client is in server.ts) | `src/core/metadataClient.ts` | Extract from server.ts, add caching |

### Tool specifications

**Tool 1: `evaluate_install_gate`**

```
Description: "Evaluate an npm-based MCP server before install or enablement. Returns a GO/REVIEW/BLOCK verdict with evidence explaining the trust posture. Checks: target resolution, source traceability, maintenance state, access domain, secrets required, mutation capability, persistence, deployment clarity, disclosure quality. Use before installing any MCP server to understand what systems it can access and what actions it can take."

Input:
  - package_name: string (required) — npm package name (e.g., "@playwright/mcp")

Output:
  - verdict: "GO" | "REVIEW" | "BLOCK"
  - summary: string
  - checks: array of { key, status, impact, signal, note }
  - reasons: array of strings (top 4)
  - recommendedActions: array of strings
  - evidence: array of { kind, ref }
  - fingerprint: object (structured metadata snapshot)
  - driftDetected: boolean (true if fingerprint changed from baseline)
```

**Tool 2: `scan_config`**

```
Description: "Scan an MCP client configuration file (.mcp.json or claude_desktop_config.json) and evaluate every installed MCP server. Returns a batch verdict summary with per-server GO/REVIEW/BLOCK verdicts. Use to audit which MCP servers in your config need review before next session."

Input:
  - config_path: string (required) — path to config file

Output:
  - servers: array of { name, package, verdict, summary }
  - summary: { total, go, review, block }
```

### Dependencies

- `@modelcontextprotocol/sdk` — MCP server framework
- `zod` — input validation
- npm registry API — package metadata
- GitHub REST API — repo metadata
- Node.js 22+

### Data storage (local only in V1)

- `~/.mcp-trust-gate/fingerprints/<package-name>.json` — fingerprint baselines
- No external database, no hosted storage, no telemetry in V1

---

## Acceptance Criteria

1. `npm run build && npm test && npm run lint` all pass
2. `evaluate_install_gate` tool produces correct verdict for:
   - `@playwright/mcp` → REVIEW (browser automation access domain)
   - `mcp-remote` → REVIEW (network access + credentials)
   - A non-existent package → BLOCK (unresolvable)
   - An archived repo → BLOCK (archived upstream)
3. `scan_config` tool correctly parses `.mcp.json` and evaluates each server
4. Verdict card output is human-readable and matches proof artifact format
5. JSON output is deterministic and matches the `InstallGateResult` schema
6. Fingerprint baseline is stored and drift is detected on subsequent evaluations
7. Tool descriptions >= 80 characters (MCP Registry requirement)
8. Zod `.describe()` on every input param (>= 40 characters)
9. No TODO/FIXME in `src/`
10. README follows @vk0 suite structure (Why, Install >= 4 clients, FAQ, Comparison table)

---

## Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Mintmark productizes fingerprint/drift into verdict product | Medium | High | Ship V1 fast, accumulate fingerprint data, position as verdict product not fingerprint library |
| patient-zero adds config scanning + historical drift | Medium | Medium | Same — ship fast, own the verdict + cross-client surface |
| Claude/OpenAI ships native install warnings | Low (6mo) | High | Moat is data (fingerprints, drift, allowlists), not check logic. Native warnings commoditize static checks but not historical evidence |
| npm/GitHub API rate limits | Medium | Low | Cache metadata locally, use conditional requests, fallback to package tarball inspection |
| Scope creep into runtime enforcement / policy platform | High | Medium | V1 is install verdict only. Policy packs, runtime enforcement, dashboards = V2+. PRD explicitly excludes. |

---

## Success Metrics (V1)

- npm weekly downloads: target >100/week within 4 weeks of publish (vs proof: 0, vs patient-zero: 64, vs getmcpm: 908)
- GitHub stars: target >10 within 4 weeks
- Marketplace presence: >= 4 marketplaces (npm, Smithery, Glama, mcp.so)
- Dogfood: >= 3 internal sessions using the tool before publish
- Fingerprint baselines stored: target >= 50 packages within 4 weeks

---

## Timeline (estimated)

| Phase | Duration | Owner |
|-------|----------|-------|
| GATE 1: PRD approval | vk decision | vk |
| Phase 2: Scaffold | 1 day | coder |
| Phase 3: Build (port proof + config scanner + fingerprint) | 3-5 days | coder |
| Phase 4: Polish (README, translations, landing) | 2-3 days | coder + content |
| Phase 5: QA | 1 day | coder |
| GATE 2: Pre-publish approval | vk decision | vk |
| Phase 6: Publish | 1 day | coder + CI |
| Phase 7: Distribute | 2-3 days | main |

**Total: ~10-14 days from GATE 1 approval to publish**

---

## Open Questions (for vk)

1. **Product name:** `@vk0/mcp-trust-gate` vs `@vk0/install-gate` vs `@vk0/trust-gate`? (I recommend `mcp-trust-gate` for clarity and SEO)
2. **Config scanner scope:** V1 = Claude Code (.mcp.json) + Claude Desktop (claude_desktop_config.json) only, or also Cursor/Windsurf/Cline? (I recommend Claude Code + Desktop first, Cursor/Windsurf/Cline in V1.1)
3. **Fingerprint storage:** Local-only in V1 (~/.mcp-trust-gate/), or start with a hosted baseline from day 1? (I recommend local-only — hosted is V2 monetization)
4. **GitHub repo name:** `vk0dev/mcp-trust-gate` or `vk0dev/trust-gate`? (I recommend `mcp-trust-gate` for npm name consistency)
