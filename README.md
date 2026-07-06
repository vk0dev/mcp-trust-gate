# mcp-trust-gate

Pre-install trust gate for MCP servers — GO/REVIEW/BLOCK verdict with evidence

## Installation

### Claude Code Plugin
```
/plugin install mcp-trust-gate@vk0-plugins
```

### NPM (standalone MCP server)
```bash
npx @vk0/mcp-trust-gate
```

### Remote HTTP
Add to `.mcp.json`:
```json
{
  "mcp-trust-gate": {
    "type": "http",
    "url": "https://mcp-trust-gate.vk0.dev/mcp"
  }
}
```

## Tools

<!-- TODO: Document each tool -->

### hello
**Input:** `name` (string) — Name to greet
**Output:** Greeting message
**When to use:** Testing connectivity only. Replace with real tools.

## Configuration

No configuration required.

## Limitations

- This is a scaffold — replace placeholder tools with real functionality.

## Changelog

### 0.1.0
- Initial scaffold
