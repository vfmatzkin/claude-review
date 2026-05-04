import { z } from "zod";
import { existsSync } from "node:fs";
import { resolvePathInRoots } from "../context.js";
import { gitDiffRange } from "../git.js";
import { asTextTool } from "./_helpers.js";

export function register(server, { router, grepRoots }) {
  server.tool(
    "audit_pr",
    "Thoroughly review a pull request / branch diff with full project context. Reads the modified files, the surrounding code, and the project's conventions before reporting findings. **IMPORTANT: use this INSTEAD OF reviewing a diff inline whenever the change spans more than ~3 files or you want a grounded second opinion before pushing.** Returns BLOCKERS / SUGGESTIONS / NOTES.",
    {
      project_path: z.string().describe("Project root (absolute or relative)."),
      base_ref: z.string().default("main").describe("Base ref to compare against."),
      head_ref: z.string().default("HEAD").describe("Head ref of the change."),
      focus: z.enum(["risk", "style", "tests", "all"]).default("all").describe("What to focus the review on."),
    },
    asTextTool(async ({ project_path, base_ref, head_ref, focus }) => {
      const target = resolvePathInRoots(project_path, grepRoots);
      if (!target || !existsSync(target)) throw new Error(`project not found: ${project_path}`);
      const diff = gitDiffRange(base_ref, head_ref, target);
      if (!diff.trim()) throw new Error(`no diff between ${base_ref} and ${head_ref}`);
      const systemPrompt = `You are a thorough code reviewer. Use Read, Glob, and Grep to inspect modified files in their full state and surrounding code as needed. Cite file:line. Output exactly:
BLOCKERS: must-fix (correctness, security, data loss). Empty if none.
SUGGESTIONS: should-fix (clarity, robustness, missing tests where it matters).
NOTES: minor observations, optional.
Focus: ${focus}. No fluff. No restating what the diff does.`;
      const userPrompt = `Diff (${base_ref}...${head_ref}) — modified files:\n${diff}`;
      return await router.execute(
        { systemPrompt, userPrompt, projectPath: target },
      );
    })
  );
}
