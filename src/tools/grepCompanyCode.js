import { z } from "zod";
import { execFileSync } from "node:child_process";
import { asTextTool } from "./_helpers.js";

export function register(server, { grepRoots }) {
  const multi = grepRoots.length > 1;
  const description = multi
    ? "Search across all configured grep roots (multiple repos) at once for a regex pattern. Returns matching lines with file:line context. **IMPORTANT: use whenever you need to find usages, references, or examples that may live in a sibling repo.**"
    : "Regex search across the configured project root, with file:line output. Equivalent in scope to Claude's built-in Grep — useful when you want to invoke it through this MCP rather than the host's tool.";
  server.tool(
    "grep_company_code",
    description,
    {
      pattern: z.string().describe("Regex pattern (ripgrep flavor)."),
      glob: z.string().optional().describe('Optional file glob, e.g. "*.py", "*.{ts,tsx}".'),
      max_results: z.number().int().min(10).max(500).default(100).describe("Cap on result lines."),
    },
    asTextTool(async ({ pattern, glob, max_results }) => {
      const perFileMax = Math.max(Math.ceil(max_results / 10), 20);
      const args = ["--no-heading", "--with-filename", "--line-number", `--max-count=${perFileMax}`];
      if (glob) args.push("--glob", glob);
      args.push("-e", pattern, "--", ...grepRoots);
      let raw = "";
      try {
        // 30s timeout caps catastrophic-backtracking patterns on large
        // codebases — ripgrep itself has no regex-engine timeout.
        raw = execFileSync("rg", args, {
          encoding: "utf8",
          maxBuffer: 8 * 1024 * 1024,
          timeout: 30_000,
        });
      } catch (e) {
        if (e.status === 1) return "No matches.";
        if (e.signal === "SIGTERM" || e.code === "ETIMEDOUT") {
          throw new Error("ripgrep timed out (likely a regex with catastrophic backtracking — simplify the pattern)");
        }
        throw new Error(`ripgrep failed: ${e.stderr?.toString() || e.message}`);
      }
      const lines = raw.split("\n").filter(Boolean);
      if (lines.length === 0) return "No matches.";
      const head = lines.slice(0, max_results).join("\n");
      const trailer =
        lines.length > max_results ? `\n\n[truncated ${lines.length - max_results} more lines]` : "";
      return head + trailer;
    })
  );
}
