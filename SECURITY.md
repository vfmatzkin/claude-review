# Security Policy

This is a single-author MIT project. Report vulnerabilities privately by email to mcp@tzk.ar. Do not file public issues for security problems.

## In scope

- Anything in `index.js` or `src/` that lets a malicious file path, glob, regex, transcript, or env value compromise the host machine running the MCP.
- Secret leakage from the MCP process into prompts, tool arguments, transcripts, or stdout.
- Path-traversal or unsanitized command construction in the tool implementations.

## Out of scope

- Vulnerabilities in `@modelcontextprotocol/sdk`. Report on the SDK repo.
- Vulnerabilities in whatever `claude` binary you've configured via `REVIEW_CLAUDE_BIN` or whatever upstream that binary talks to.
- The fact that this MCP runs `claude` subprocesses with the spawned profile's permissions. That's by design: the spawned session inherits its profile's MCP servers, hooks, and tool permissions.

## Response

I will reply within 7 days. If the issue is reproducible and in scope, I will work on a fix and credit you in the release notes (unless you'd rather stay anonymous).
