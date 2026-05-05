# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run selftest` — spawns one `claude -p` round-trip against the configured binary; prints `selftest ok` if the upstream is reachable. Run this after any change to `src/upstream.js` or to env handling in `index.js`.
- `npm start` — boots the MCP server on stdio. Only useful when wiring it into a non-Claude-Code MCP client; Claude Code launches it itself once registered with `claude mcp add`.
- `node --check index.js && find src -name '*.js' -exec node --check {} \;` — the same syntax check CI runs (`.github/workflows/ci.yml`) on Node 20 and 22. There is no other test suite.

## Architecture

Entry point `index.js` builds one `ClaudeUpstream` (the `claude` subprocess wrapper) and dependency-injects `{ upstream, grepRoots, glossaryPath, domainHint }` into each tool module's `register(server, deps)`. Every tool lives in `src/tools/<name>.js` and is added to the `modules` array in `index.js` to be discovered.

`upstream.execute` (`src/upstream.js`) is the load-bearing call — every tool eventually goes through it. It spawns the configured binary with `-p <userPrompt> --output-format text [--append-system-prompt <systemPrompt>]`, sanitizes the env (strips `*_KEY|*_TOKEN|*_SECRET|*_PASSWORD|*_PASSWD|API_KEY` before passing through so subprocesses don't inherit unrelated credentials), and snapshots the project's transcript dir (`<CLAUDE_CONFIG_DIR>/projects/<encoded-cwd>/*.jsonl`) before/after the call to identify which `.jsonl` the spawned session wrote — that path is returned as `transcriptPath` and surfaced as a `[claude transcript: ...]` footer by `asTextTool` so the caller can inspect it via `inspect_transcript`.

Profile isolation is the whole point: setting `REVIEW_CLAUDE_CONFIG_DIR` makes spawned subprocesses honor a different `CLAUDE_CONFIG_DIR` than the host Claude Code session, so the reviewer can use a different model, MCP server set, or provider profile while still seeing the same project's `CLAUDE.md` tree.

## Tool conventions

Every tool file follows the same shape — mirror an existing one when adding a new tool:

1. `import { asTextTool } from "./_helpers.js"` and wrap the handler with it. `asTextTool` converts thrown errors into `{ isError: true }` MCP responses and appends the transcript footer when the upstream returns one.
2. Export `register(server, deps)` and call exactly one `server.tool(name, description, zodSchema, handler)`.
3. The description must include an `**IMPORTANT:**` cue telling Claude **when** to reach for the tool, not just what it does — that cue is what drives the host's tool-selection heuristic. Keep that style when editing descriptions.
4. Resolve user-supplied paths through `resolvePathInRoots(path, grepRoots)` (`src/context.js`) so relative paths work and only configured roots are reachable.
5. For tools that pre-load a file or git data and pass it inline (`read_with_question`, `code_archaeology`, `compare_files`), enrich the system prompt with `loadProjectContext(absPath, { grepRoots })` so the spawned reviewer sees the same `CLAUDE.md` chain Claude Code itself would load.

## Security boundaries

- `src/git.js` validates refs against `^[A-Za-z0-9_./^~@{}+=:-]+$` before passing to `git` so caller-supplied refs can't smuggle flags like `--upload-pack=evil`. Use `safeRef` if you add new git helpers that accept user input.
- `inspect_transcript` is confined to `~/.claude/projects/` and `~/.claude-*/projects/` via `realpathSync` checks (`src/tools/inspectTranscript.js`) so it can't be used as a generic file reader. Don't relax this without a reason.
- `grep_company_code` shells out to `rg` with a 30s timeout to bound catastrophic regex backtracking.
- Subprocess output is capped at `MAX_OUTPUT_BYTES = 5 MB` to prevent OOM on runaway sessions.

## Distribution caveats

- `package.json` `files` is the npm-publish allowlist. Anything new that needs to ship (new top-level files, new directories) must be added there or it won't be in the package.
- The README's snippet for end-user `CLAUDE.md` integration lives at `claude-md-section.md` — keep it in sync with any tool name or signature change so users get accurate guidance when they paste it into their own `CLAUDE.md`.
- CI is `node --check` on Node 20 and 22 against `master` and PRs (the workflow is on `branches: [master]` even though the current branch is `main` — adjust if/when the default branch is renamed).
