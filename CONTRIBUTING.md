# Contributing

PRs welcome. Issues too.

## Setup

```bash
git clone git@github.com:vfmatzkin/claude-review.git
cd claude-review
npm install
npm run selftest
```

`selftest` round-trips one prompt through `claude -p`. It needs the `claude` binary on `PATH` and a working profile (default Anthropic key, or a custom profile via `REVIEW_CLAUDE_CONFIG_DIR`). If it returns `selftest ok` you're set.

## Workflow

- Branch off `master`.
- One logical change per commit.
- Commit messages: imperative, single line, <72 chars (`add foo`, not `Added foo.`).
- No co-author attribution lines.
- Open a PR against `master`. CI runs `node --check` on every JS file.

## What I'll merge

- Bug fixes with a clear repro.
- New tools that fit the existing pattern (`src/tools/<name>.js`, exporting `register(server, deps)`).
- Doc fixes.

## What I won't merge

- Aesthetic refactors with no behavior change.
- New dependencies without a concrete need.
- Hidden feature flags or "alternate paths" kept around just in case.
- Tests that mock the upstream so deeply they no longer prove anything.

## Adding a tool

A tool is one file in `src/tools/`. Mirror an existing one. Each tool:

1. Imports `asTextTool` from `_helpers.js`.
2. Exports `register(server, deps)` where `deps` is the same object `index.js` builds (`{ router, grepRoots, glossaryPath, domainHint }`).
3. Registers exactly one `server.tool(name, description, schema, handler)`.
4. Has a description that tells Claude *when* to reach for it (the `**IMPORTANT:**` cue), not just what it does.

Add the new module to the `modules` array in `index.js`.
