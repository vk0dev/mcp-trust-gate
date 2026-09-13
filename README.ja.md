# @vk0/mcp-trust-gate

MCPサーバーのインストール前トラストゲート — 何かをインストールする前に、証拠付きの決定論的な GO/REVIEW/BLOCK 判定を返します。

[![npm](https://img.shields.io/npm/v/@vk0/mcp-trust-gate)](https://www.npmjs.com/package/@vk0/mcp-trust-gate)
[![license](https://img.shields.io/npm/l/@vk0/mcp-trust-gate)](./LICENSE)

[English](./README.md) | [Русский](./README.ru.md) | [简体中文](./README.zh-CN.md) | [Español](./README.es.md)

## なぜ必要か

MCPサーバーは実際のアクセス権を得ます: ファイルシステム、ブラウザ、認証情報、インフラ。`npm install` は、エージェントがツールを呼び始めたときにサーバーが何を*できる*のかを教えてくれません — READMEのマーケティング文も同様です。問題が起きた後ではなく、サーバーが動く**前**にその答えが必要です。

ユーザーが次のように尋ねたときに使ってください:
- 「このMCPサーバーをインストールしても安全?」
- 「`@some/mcp-package` は実際に何にアクセスできる?」
- 「新しいセッションを始める前に `.mcp.json` のMCPサーバーを監査して。」
- 「同僚やエージェントが追加したこのMCP設定を承認すべき?」
- 「前回承認したときからこのMCPサーバーの挙動は変わった?」

`mcp-trust-gate` は、雰囲気ではなく証拠に裏付けられた決定論的な判定 — `GO`、`REVIEW`、`BLOCK` — で答えます。

## インストール

### Claude Code
```bash
claude mcp add mcp-trust-gate -- npx -y @vk0/mcp-trust-gate
```

### Claude Desktop
`claude_desktop_config.json` に追加:
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
`.cursor/mcp.json` に追加:
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
`~/.codeium/windsurf/mcp_config.json` に追加:
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

### CLI(スタンドアロン、MCPクライアント不要)
```bash
npx @vk0/mcp-trust-gate @playwright/mcp --card
```

## ツール

### `evaluate_install_gate`
**入力:** `package_name`(文字列)— 評価するMCPサーバーのnpmパッケージ名。例: `@playwright/mcp`、`mcp-remote`。
**出力:** 判定(`GO`/`REVIEW`/`BLOCK`)、要約、証拠付きの9つの個別チェック、推奨アクション、そして前回評価とのドリフト検出付きの現在のトラスト状態のフィンガープリント。
**使いどころ:** npmベースのMCPサーバーをインストール・有効化する前。

### `scan_config`
**入力:** `config_path`(文字列)— `.mcp.json` または `claude_desktop_config.json` へのパス。
**出力:** サーバーごとの判定と合計(`go`/`review`/`block`/`skipped`)を含むバッチ要約。
**使いどころ:** クライアントに設定済みのすべてのMCPサーバーを監査するとき。例: 新しいセッションの前や、チームメイトの設定のレビュー時。

## 会話例

> **ユーザー:** `@playwright/mcp` をインストールしても安全?
>
> **エージェント:** *`evaluate_install_gate({ package_name: "@playwright/mcp" })` を呼び出す*
>
> **エージェント:** REVIEW。パッケージは正しく解決され、最近のメンテナンス活動がある `microsoft/playwright-mcp` まで追跡できますが、ブラウザ自動化を謳っています — 有効化する前に、正確なシステム境界(どのサイト、どのブラウザプロファイル)を確認してください。

## 仕組み

```
npmパッケージ名
      │
      ▼
┌─────────────────┐     ┌──────────────────────┐
│  npmレジストリ    │────▶│ 9つの決定論的チェック  │
│  GitHub API      │     │ (正規表現ベースの     │
│  (キャッシュ,ETag)│     │  シグナル検出)        │
└─────────────────┘     └──────────┬───────────┘
                                    ▼
                          判定: GO / REVIEW / BLOCK
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                                ▼
          フィンガープリント保存              証拠 + 理由 +
          ~/.mcp-trust-gate/                 推奨アクションを
          fingerprints/<pkg>.json            エージェントに返す
                    │
                    ▼
          次回の評価と比較
          → ドリフト検出?
```

チェックはnpmレジストリのメタデータと、公開GitHubリポジトリが解決できる場合はリポジトリのメタデータ(アーカイブ状態、最終push)に対して実行されます。何も実行されません — これは静的なメタデータ評価であり、サンドボックスやランタイムスキャンではありません。

## 比較

| | `mcp-trust-gate` | READMEの手動レビュー | `npm audit` | Smitheryスキャン |
|---|---|---|---|---|
| 「このMCPサーバーは何にアクセスできる?」に答える | ✅ 構造化された判定 | ⚠️ レビュアー次第 | ❌ 依存関係のCVEのみ | ⚠️ マーケットプレイス側、ローカルでない |
| インストール前にエージェント内から実行 | ✅ MCPツール呼び出し | ❌ 手動 | ❌ 手動 | ❌ ウェブダッシュボード |
| 決定論的で再現可能な判定 | ✅ | ❌ レビュアーで変わる | ✅(CVEについて) | ⚠️ 不透明なスコアリング |
| 前回承認からのドリフト検出 | ✅ フィンガープリント + ドリフト | ❌ | ❌ | ❌ |
| クライアント設定全体を一回で監査 | ✅ `scan_config` | ❌ | ❌ | ❌ |
| 既知の依存関係脆弱性のスキャン | ❌(対象外) | ❌ | ✅ | ⚠️ 部分的 |

## FAQ

**ネットワーク呼び出しはある?**
はい。`evaluate_install_gate` と `scan_config` はnpmレジストリ(`registry.npmjs.org`)と、パッケージメタデータからGitHubリポジトリが解決できる場合はGitHub REST API(`api.github.com`)に問い合わせます。レスポンスは5分間メモリ内にキャッシュされ、GitHubへは条件付き(ETag)リクエストでレート制限の圧力を減らします。

**APIキーは必要?**
いいえ。両APIとも未認証で問い合わせます。未認証のGitHub API呼び出しはより厳しくレート制限されます — 上限に達した場合、リポジトリメタデータに依存するチェックは評価を失敗させず、グレースフルにフォールバックします。

**判定の精度は?**
チェックはnpmパッケージメタデータ(説明、キーワード、bin名、README周辺フィールド)に対する決定論的な正規表現ベースのシグナル検出で、ランタイム監査でもコードレベル監査でもありません。`GO` は「メタデータに明白な赤信号がない」であって「形式的に安全と検証済み」ではありません。`REVIEW` と `BLOCK` の判定にはトリガーとなった具体的な証拠が含まれ、自分で判断できます。

**GitHubのみ・非npmのMCPサーバーは?**
V1はnpm公開ターゲットのみを評価します。`scan_config` は `npx`/npmパッケージ名経由で動かないサーバーをスキップし、推測せず `SKIPPED` として報告します。

**フィンガープリントデータの保存場所は?**
ローカルの `~/.mcp-trust-gate/fingerprints/<package-name>.json` です。どこにも送信されません。各 `evaluate_install_gate` 呼び出しは前回保存されたフィンガープリントと比較し、アクセスドメイン、変更能力、シークレット要件、永続化シグナルが変わっていれば `driftDetected` を報告します。

## 制限事項

- V1は `registry.npmjs.org` で解決できるnpm公開MCPサーバーのみを評価します。
- `scan_config` は `.mcp.json` と `claude_desktop_config.json` の形式のみをパースします。Cursor/Windsurf/Cline固有の設定形式は未対応です。
- チェックは静的なメタデータヒューリスティックであり、ランタイムサンドボックス、コード監査、依存関係脆弱性スキャンではありません。
- 未認証のGitHub API呼び出しはGitHubの公開レート制限に従います。

## Changelog

[CHANGELOG.md](./CHANGELOG.md) を参照。

## ライセンス

MIT
