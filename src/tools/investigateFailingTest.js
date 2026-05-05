import { z } from "zod";
import { existsSync } from "node:fs";
import { resolvePathInRoots } from "../context.js";
import { asTextTool } from "./_helpers.js";

export function register(server, { upstream, grepRoots }) {
  server.tool(
    "investigate_failing_test",
    "Investigate why a specific test is failing. The session reads the test, the code under test, related fixtures, and recent edits, then returns the most likely root cause and a suggested fix. **IMPORTANT: use this whenever the user describes or pastes a test failure and asks why or how to fix it.** Read-only — does not modify any files.",
    {
      test_identifier: z.string().describe("Test path, node ID, or class.method name."),
      project_path: z
        .string()
        .describe("Project root the test belongs to (absolute or relative)."),
      failure_output: z
        .string()
        .optional()
        .describe("Optional: the test runner's failure output if available."),
    },
    asTextTool(async ({ test_identifier, project_path, failure_output }) => {
      const target = resolvePathInRoots(project_path, grepRoots);
      if (!target || !existsSync(target)) throw new Error(`project not found: ${project_path}`);
      const systemPrompt = `You are a test-failure investigator. Read the test, the code under test, and any related fixtures or helpers. If failure output is provided, anchor your analysis on the specific exception and line. Output:
ROOT CAUSE: one paragraph explaining what is actually wrong.
SUGGESTED FIX: concrete change(s), with file:line references.
RELATED RISK: one sentence flagging anything else this might affect (or "none observed").
Be concrete. Do not over-explore.`;
      const userPrompt = failure_output
        ? `Test: ${test_identifier}\n\n---FAILURE OUTPUT---\n${failure_output}`
        : `Test: ${test_identifier}`;
      return await upstream.execute(
        { systemPrompt, userPrompt, projectPath: target },
      );
    })
  );
}
