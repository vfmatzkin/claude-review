import { z } from "zod";
import { existsSync } from "node:fs";
import { resolvePathInRoots } from "../context.js";
import { asTextTool } from "./_helpers.js";

export function register(server, { router, grepRoots }) {
  server.tool(
    "research_project",
    "Spawn a research-only AI session inside a project directory and ask it a question. The session loads every CLAUDE.md in the tree, can grep, glob, and read files across the whole project, and returns a grounded answer with cited paths. **IMPORTANT: use this INSTEAD OF the Explore subagent (Task) whenever a question requires multi-file reasoning or you would otherwise spend many tool calls navigating a codebase to answer.** Read-only — the session cannot edit, write, run bash, or call external services.",
    {
      project_path: z.string().describe("Absolute or relative project root."),
      question: z.string().describe("The research question to answer."),
    },
    asTextTool(async ({ project_path, question }) => {
      const abs = resolvePathInRoots(project_path, grepRoots);
      if (!abs || !existsSync(abs)) throw new Error(`project not found: ${project_path}`);
      const systemPrompt = `You are a read-only project research assistant. Use Read, Glob, and Grep to gather what you need, then give a grounded, cited answer. Be concrete: when you reference code, include the file:line. Stop once you can answer; do not over-explore.`;
      return await router.execute(
        { systemPrompt, userPrompt: question, projectPath: abs },
      );
    })
  );
}
