# claude-review-mcp

![License](https://img.shields.io/badge/license-MIT-blue) ![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen) ![MCP](https://img.shields.io/badge/MCP-compatible-blue)

An MCP server that gives Claude Code 10 review and research tools, each backed by an isolated `claude` subprocess.

## Why

Solo dev. I want a second-opinion reviewer inside my Claude Code session that doesn't share state with it. Each tool spawns a fresh `claude` subprocess so the reviewer sees the same CLAUDE.md context but starts with a clean transcript.

## Tools

| Tool | What it does |
|---|---|
| `audit_pr` | Thorough PR/branch review with project context. BLOCKERS / SUGGESTIONS / NOTES. |
| `read_with_question` | Answer a focused question about a file without loading the full body. |
| `research_project` | Multi-file research, replaces the Explore subagent. |
| `compare_files` | Semantic diff between two files (behavior, intent, performance). |
| `find_examples_of` | Natural-language pattern search across the project. |
| `investigate_failing_test` | Test failure root-cause analysis. |
| `code_archaeology` | Why does this code look like this? Git-history-grounded answers. |
| `inspect_transcript` | Compact view of a `.jsonl` Claude session transcript. |
| `domain_glossary_lookup` | Internal term / abbreviation definition. |
| `grep_company_code` | Regex search across configured project roots. |

## Setup

```bash
git clone git@github.com:vfmatzkin/claude-review.git ~/Code/claude-review-mcp
cd ~/Code/claude-review-mcp
npm install
```

Smoke test:

```bash
npm run selftest
```

`selftest` spawns one `claude -p ...` round-trip. It needs the `claude` binary on `PATH` and working auth (Anthropic key or whatever profile you've configured). If it returns `selftest ok` you're done.

## Register in Claude Code

User scope (every project on your machine sees it):

```bash
claude mcp add claude-review --scope user -- node ~/Code/claude-review-mcp/index.js
```

Or commit a project-scope `.mcp.json` (see `.mcp.example.json`) so a repo's whole team picks it up.

## Configuration

| Var | Required | Default |
|---|---|---|
| `REVIEW_CLAUDE_BIN` | no | `claude` |
| `REVIEW_CLAUDE_CONFIG_DIR` | no | inherited from the parent process |
| `REVIEW_PROJECT` | no | `$PWD` |
| `REVIEW_GLOSSARY_PATH` | no | — |
| `REVIEW_DOMAIN_HINT` | no | a generic blurb |

Two common setups:

1. **Stock Anthropic.** Don't set anything. The spawned `claude` uses your default profile and key.
2. **Sandboxed profile** (different model, different MCP servers, or routed to a non-Anthropic provider). Point `REVIEW_CLAUDE_CONFIG_DIR` at the alternate profile's config dir. The spawned `claude` honors `CLAUDE_CONFIG_DIR` and uses that profile's `settings.json`.

How you set up that alternate profile (third-party adapter, alternative model, restricted skills) is outside this MCP's scope.

## MCP servers that hold secrets

Don't put MCP servers with secrets (brave-search, etc.) in this repo's project `.mcp.json`. Install them at user scope so every project on your machine inherits them and the secret never lives in the working tree:

```bash
claude mcp add brave-search --scope user -e BRAVE_API_KEY=<your-key> -- npx -y @modelcontextprotocol/server-brave-search
```

The committed `.mcp.example.json` only registers `claude-review` itself.

## Optional: always-visible transcript path

Each tool call already returns the spawned subprocess's `.jsonl` transcript path in its response footer, but the host model often summarizes that line away. To surface it deterministically (rendered by the harness, not the model), add a `PostToolUse` hook to your `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PostToolUse": [{
      "matcher": "mcp__claude-review__.*",
      "hooks": [{
        "type": "command",
        "command": "jq -r '.tool_response[]?.text? // empty' | grep -oE '/[^[:space:]`]+\\.jsonl' | head -1 | awk 'NF{printf \"{\\\"systemMessage\\\":\\\"📄 transcript: %s — read with inspect_transcript\\\"}\\n\", $0}'",
        "timeout": 5000
      }]
    }]
  }
}
```

After saving, open `/hooks` once (or restart the session) so Claude Code reloads the config. Every subsequent `mcp__claude-review__*` call will print a `📄 transcript: …` line you can hand to `inspect_transcript`.

## Architecture

```
src/
  upstream.js     ClaudeUpstream (spawns claude, snapshots transcripts)
  context.js      path resolution + CLAUDE.md tree walker + safe file read
  git.js          git log/diff/blame helpers
  tools/
    _helpers.js   asTextTool wrapper
    *.js          one file per tool, exports register(server, deps)
index.js          env loading, dependency injection, server start
```

No fallback upstream. The configured binary is the only path; if it fails the tool fails.

## Companion: ai-review pipeline

If you want these tools driven from the shell instead of triggered
by-hand inside a Claude Code session, see
[ai-review](https://github.com/vfmatzkin/ai-review). It's a CLI that
runs multiple specialized reviewers against a PR, line-anchors the
findings, and posts one consolidated GitHub review — under a per-repo
GitHub App if you want bot identity. The reviewers' default tool
allowlist already calls out the `mcp__claude-review__*` names exposed
by this server, so installing both gives you richer research depth in
the pipeline.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Security issues: [SECURITY.md](./SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
