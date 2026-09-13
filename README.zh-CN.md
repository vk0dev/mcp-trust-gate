# @vk0/mcp-trust-gate

MCP 服务器的安装前信任门 — 在你安装任何东西之前，给出带证据的确定性 GO/REVIEW/BLOCK 判定。

[![npm](https://img.shields.io/npm/v/@vk0/mcp-trust-gate)](https://www.npmjs.com/package/@vk0/mcp-trust-gate)
[![license](https://img.shields.io/npm/l/@vk0/mcp-trust-gate)](./LICENSE)

[English](./README.md) | [Русский](./README.ru.md) | [日本語](./README.ja.md) | [Español](./README.es.md)

## 为什么需要

MCP 服务器会获得真实的访问权限：你的文件系统、浏览器、凭据、基础设施。`npm install` 不会告诉你当代理开始调用其工具时服务器能*做*什么 — README 的营销文案通常也不会。你需要在服务器运行**之前**得到答案，而不是在出事之后。

当用户这样问时使用它：
- 「安装这个 MCP 服务器安全吗？」
- 「`@some/mcp-package` 实际能访问什么？」
- 「在我开始新会话前，审计一下 `.mcp.json` 里的 MCP 服务器。」
- 「同事/代理添加的这个 MCP 配置我该批准吗？」
- 「自上次批准以来，这个 MCP 服务器的行为变了吗？」

`mcp-trust-gate` 用确定性判定回答 — `GO`、`REVIEW` 或 `BLOCK` — 以证据为依据，而不是凭感觉。

## 安装

### Claude Code
```bash
claude mcp add mcp-trust-gate -- npx -y @vk0/mcp-trust-gate
```

### Claude Desktop
添加到 `claude_desktop_config.json`：
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
添加到 `.cursor/mcp.json`：
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
添加到 `~/.codeium/windsurf/mcp_config.json`：
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

### CLI（独立使用，无需 MCP 客户端）
```bash
npx @vk0/mcp-trust-gate @playwright/mcp --card
```

## 工具

### `evaluate_install_gate`
**输入：** `package_name`（字符串）— 要评估的 MCP 服务器的 npm 包名，例如 `@playwright/mcp` 或 `mcp-remote`。
**输出：** 判定（`GO`/`REVIEW`/`BLOCK`）、摘要、带证据的 9 项独立检查、建议措施，以及当前信任状态的指纹（与上次评估比对的漂移检测）。
**何时使用：** 在安装或启用任何基于 npm 的 MCP 服务器之前。

### `scan_config`
**输入：** `config_path`（字符串）— `.mcp.json` 或 `claude_desktop_config.json` 文件的路径。
**输出：** 批量摘要，包含每个服务器的判定和总计（`go`/`review`/`block`/`skipped`）。
**何时使用：** 审计客户端中已配置的所有 MCP 服务器，例如在开始新会话前或审查同事的配置时。

## 对话示例

> **用户：** 安装 `@playwright/mcp` 安全吗？
>
> **代理：** *调用 `evaluate_install_gate({ package_name: "@playwright/mcp" })`*
>
> **代理：** REVIEW。该包解析正常，可追溯到近期有维护活动的 `microsoft/playwright-mcp`，但它声明了浏览器自动化能力 — 启用前请确认确切的系统边界（哪些网站、哪个浏览器配置文件）。

## 工作原理

```
npm 包名
      │
      ▼
┌─────────────────┐     ┌──────────────────────┐
│  npm 注册表      │────▶│ 9 项确定性检查        │
│  GitHub API      │     │ （基于正则的          │
│  （缓存, ETag）   │     │  信号检测）           │
└─────────────────┘     └──────────┬───────────┘
                                    ▼
                          判定: GO / REVIEW / BLOCK
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
          指纹保存于                          证据 + 原因 +
          ~/.mcp-trust-gate/                  建议措施
          fingerprints/<pkg>.json             返回给代理
                    │
                    ▼
          与下次评估比对
          → 检测到漂移？
```

检查针对 npm 注册表元数据运行；当能解析出公开 GitHub 仓库时，还包括仓库元数据（归档状态、最近 push）。不执行任何代码 — 这是静态元数据评估，不是沙箱或运行时扫描。

## 对比

| | `mcp-trust-gate` | 人工审查 README | `npm audit` | Smithery 扫描 |
|---|---|---|---|---|
| 回答「这个 MCP 服务器能访问什么？」 | ✅ 结构化判定 | ⚠️ 取决于审查者 | ❌ 仅依赖项 CVE | ⚠️ 市场侧，非本地 |
| 安装前、在代理内部运行 | ✅ MCP 工具调用 | ❌ 手动 | ❌ 手动 | ❌ 网页仪表盘 |
| 确定性、可复现的判定 | ✅ | ❌ 因审查者而异 | ✅（对 CVE） | ⚠️ 不透明的评分 |
| 检测自上次批准以来的漂移 | ✅ 指纹 + 漂移 | ❌ | ❌ | ❌ |
| 一次调用审计整个客户端配置 | ✅ `scan_config` | ❌ | ❌ | ❌ |
| 扫描已知依赖项漏洞 | ❌（不在范围内） | ❌ | ✅ | ⚠️ 部分 |

## FAQ

**它会发起网络请求吗？**
会。`evaluate_install_gate` 和 `scan_config` 查询 npm 注册表（`registry.npmjs.org`），当能从包元数据解析出 GitHub 仓库时还会查询 GitHub REST API（`api.github.com`）。响应在内存中缓存 5 分钟，对 GitHub 使用条件（ETag）请求以减轻速率限制压力。

**需要 API 密钥吗？**
不需要。两个 API 均以未认证方式查询。未认证的 GitHub API 调用速率限制更严格 — 达到上限时，依赖仓库元数据的检查会优雅降级，而不是让评估失败。

**判定有多准确？**
检查是对 npm 包元数据（描述、关键词、bin 名称、README 相关字段）的确定性正则信号检测 — 不是运行时或代码级审计。请把 `GO` 理解为「元数据中没有明显红旗」，而非「经形式化验证的安全」。`REVIEW` 和 `BLOCK` 判定包含触发它们的具体证据，你可以自行判断。

**仅在 GitHub 上或非 npm 的 MCP 服务器怎么办？**
V1 只评估发布到 npm 的目标。`scan_config` 会跳过不通过 `npx`/npm 包名运行的服务器，报告为 `SKIPPED` 而不是猜测。

**指纹数据存在哪里？**
本地的 `~/.mcp-trust-gate/fingerprints/<package-name>.json`。不会发送到任何地方。每次 `evaluate_install_gate` 调用都会与上次保存的指纹比对，若访问域、变更能力、密钥需求或持久化信号发生变化，则报告 `driftDetected`。

## 限制

- V1 仅评估在 `registry.npmjs.org` 有可解析条目的 npm 发布的 MCP 服务器。
- `scan_config` 仅解析 `.mcp.json` 和 `claude_desktop_config.json` 格式；暂不解析 Cursor/Windsurf/Cline 专有的配置格式。
- 检查是静态元数据启发式，不是运行时沙箱、代码审计或依赖项漏洞扫描。
- 未认证的 GitHub API 调用受 GitHub 公开速率限制约束。

## 更新日志

见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

MIT
