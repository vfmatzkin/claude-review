### Second-opinion review tools
For diffs spanning >3 files, or any time you want a grounded second opinion before pushing, use the `mcp__claude-review__*` tools **INSTEAD OF reviewing a diff inline**:

- **Full PR/branch audit**: `mcp__claude-review__audit_pr(project_path, base_ref, head_ref, focus)` — BLOCKERS / SUGGESTIONS / NOTES with project context.
- **Focused question about a single file**: `mcp__claude-review__read_with_question(file_path, question)` — answers without loading the file body into your context.
- **Multi-file research / "how does X work across files"**: `mcp__claude-review__research_project(project_path, question)` — read-only session with full project CLAUDE.md context.
- **Compare two files semantically**: `mcp__claude-review__compare_files(path_a, path_b, focus)` — behavior, intent, or performance, not character diff.
- **Find examples matching a description**: `mcp__claude-review__find_examples_of(description, project_path?)` — natural-language pattern search.
- **Investigate a test failure**: `mcp__claude-review__investigate_failing_test(test_identifier, project_path, failure_output?)`.
- **Why does this code look like this**: `mcp__claude-review__code_archaeology(file_path, question)` — git-history-grounded answers.
- **Inspect a claude-review transcript**: `mcp__claude-review__inspect_transcript(transcript_path, question?)` — compressed view of a .jsonl session.
- **Domain term you don't recognise**: `mcp__claude-review__domain_glossary_lookup(term, context)`.
- **Cross-project grep**: `mcp__claude-review__grep_company_code(pattern, glob, max_results)` — searches all configured work repos.

These tools spawn independent `claude` subprocesses for the review. They see the same CLAUDE.md context but do not share this conversation's state.
