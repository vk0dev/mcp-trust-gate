# @vk0/mcp-trust-gate

Pre-install trust gate for MCP servers — deterministic GO/REVIEW/BLOCK verdict with evidence, before you install anything.

[![npm](https://img.shields.io/npm/v/@vk0/mcp-trust-gate)](https://www.npmjs.com/package/@vk0/mcp-trust-gate)
[![license](https://img.shields.io/npm/l/@vk0/mcp-trust-gate)](./LICENSE)

## Why

MCP servers get real access: your filesystem, your browser, your credentials, your infrastructure. `npm install` doesn't tell you what a server can *do* once an agent starts calling its tools — README marketing copy usually doesn't either. You need that answer **before** the server ever runs, not after something goes wrong.

Use this when the user asks:
- "Is it safe to install this MCP server?"
- "What can `@some/mcp-package` actually access?"
- "Audit the MCP servers in my `.mcp.json` before I start a new session."
- "Should I approve this MCP config a teammate/agent added?"
- "Has this MCP server's behavior changed since I last approved it?"

`mcp-trust-gate` answers with a deterministic verdict — `GO`, `REVIEW`, or `BLOCK` — backed by evidence, not a vibe.

## Install

### Claude Code
```bash
claude mcp add mcp-trust-gate -- npx -y @vk0/mcp-trust-gate
```

### Claude Desktop
Add to `claude_desktop_config.json`:
```json
{
  "mcpServers": {
    "mcp-trust-gate": {
      "command": "npx",
      "args": ["-y", "@vk0/mcp-trust-gate"]
    }
  }
}
```

### Cursor
Add to `.cursor/mcp.json`:
```json
{
  "mcpServers": {
    "mcp-trust-gate": {
      "command": "npx",
      "args": ["-y", "@vk0/mcp-trust-gate"]
    }
  }
}
```

### Windsurf
Add to `~/.codeium/windsurf/mcp_config.json`:
```json
{
  "mcpServers": {
    "mcp-trust-gate": {
      "command": "npx",
      "args": ["-y", "@vk0/mcp-trust-gate"]
    }
  }
}
```

### CLI (standalone, no MCP client)
```bash
npx @vk0/mcp-trust-gate @playwright/mcp --card
```

## Tools

### `evaluate_install_gate`
**Input:** `package_name` (string) — the npm package name of the MCP server to evaluate, e.g. `@playwright/mcp` or `mcp-remote`.
**Output:** verdict (`GO`/`REVIEW`/`BLOCK`), summary, 9 individual checks with evidence, recommended actions, and a fingerprint of the current trust posture with drift detection against the last evaluation.
**When to use:** before installing or enabling any npm-based MCP server.

### `scan_config`
**Input:** `config_path` (string) — path to a `.mcp.json` or `claude_desktop_config.json` file.
**Output:** a batch summary with a per-server verdict and totals (`go`/`review`/`block`/`skipped`).
**When to use:** to audit every MCP server already configured in a client, e.g. before starting a new session or reviewing a teammate's config.

## Example conversation

> **User:** Is it safe to install `@playwright/mcp`?
>
> **Agent:** *calls `evaluate_install_gate({ package_name: "@playwright/mcp" })`*
>
> **Agent:** REVIEW. It resolves cleanly and is traceable to `microsoft/playwright-mcp` with recent maintenance activity, but it advertises browser automation — confirm the exact system boundary (which sites, which browser profile) before enabling it.

## How it works

```
npm package name
      │
      ▼
┌─────────────────┐     ┌──────────────────────┐
│  npm registry    │────▶│ 9 deterministic      │
│  GitHub API      │     │ checks (regex-based  │
│  (cached, ETag)  │     │ signal detection)    │
└─────────────────┘     └──────────┬───────────┘
                                    ▼
                          verdict: GO / REVIEW / BLOCK
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
          fingerprint stored                  evidence + reasons +
          ~/.mcp-trust-gate/                  recommended actions
          fingerprints/<pkg>.json             returned to the agent
                    │
                    ▼
          compared against next
          evaluation → drift detected?
```

Checks run against npm registry metadata and, where a public GitHub repository can be resolved, repository metadata (archived state, last push). Nothing is executed — this is a static metadata evaluation, not a sandbox or runtime scan.

## Comparison

| | `mcp-trust-gate` | Manual README review | `npm audit` | Smithery scanning |
|---|---|---|---|---|
| Answers "what can this MCP server access?" | ✅ structured verdict | ⚠️ depends on reviewer | ❌ dependency CVEs only | ⚠️ marketplace-side, not local |
| Runs before install, from inside the agent | ✅ MCP tool call | ❌ manual | ❌ manual | ❌ web dashboard |
| Deterministic, reproducible verdict | ✅ | ❌ varies by reviewer | ✅ (for CVEs) | ⚠️ opaque scoring |
| Detects drift since last approval | ✅ fingerprint + drift | ❌ | ❌ | ❌ |
| Audits an entire client config in one call | ✅ `scan_config` | ❌ | ❌ | ❌ |
| Scans for known dependency vulnerabilities | ❌ (out of scope) | ❌ | ✅ | ⚠️ partial |

## FAQ

**Does this make network calls?**
Yes. `evaluate_install_gate` and `scan_config` query the npm registry (`registry.npmjs.org`) and, when a GitHub repository can be resolved from the package metadata, the GitHub REST API (`api.github.com`). Responses are cached in-memory for 5 minutes with conditional (ETag) requests to GitHub to reduce rate-limit pressure.

**Does it need an API key?**
No. Both APIs are queried unauthenticated. Unauthenticated GitHub API calls are rate-limited more aggressively — if you hit that limit, checks that depend on repository metadata fall back gracefully rather than failing the evaluation.

**How accurate is the verdict?**
Checks are deterministic regex-based signal detection over npm package metadata (description, keywords, bin names, README-adjacent fields) — not a runtime or code-level audit. Treat `GO` as "no obvious red flags in the metadata," not "formally verified safe." `REVIEW` and `BLOCK` verdicts include the specific evidence that triggered them so you can judge for yourself.

**What happens to a GitHub-only or non-npm MCP server?**
V1 only evaluates npm-published targets. `scan_config` skips servers that don't run via `npx`/an npm package name and reports them as `SKIPPED` rather than guessing.

**Where is fingerprint data stored?**
Locally, at `~/.mcp-trust-gate/fingerprints/<package-name>.json`. Nothing is sent anywhere. Each `evaluate_install_gate` call compares against the last stored fingerprint and reports `driftDetected` if the access domain, mutation capability, secrets requirement, or persistence signal changed.

## Limitations

- V1 only evaluates npm-published MCP servers with a resolvable `registry.npmjs.org` entry.
- `scan_config` parses `.mcp.json` and `claude_desktop_config.json` shapes only; it does not parse Cursor/Windsurf/Cline-specific config formats yet.
- Checks are static metadata heuristics, not a runtime sandbox, code audit, or dependency vulnerability scan.
- Unauthenticated GitHub API calls are subject to GitHub's public rate limits.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
