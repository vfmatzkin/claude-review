import { z } from "zod";
import { existsSync } from "node:fs";
import { resolvePathInRoots } from "../context.js";
import { asTextTool } from "./_helpers.js";

export function register(server, { router, grepRoots }) {
  server.tool(
    "find_examples_of",
    "Find code examples in a project that match a natural-language description, not a literal regex. Returns matching files with the relevant lines. **IMPORTANT: use whenever you want to copy a pattern that is used elsewhere in the codebase but you do not know the exact syntax to grep for.** Goes beyond literal Grep by reasoning about intent.",
    {
      description: z.string().describe("Natural-language description of the pattern, e.g. 'a service that wraps a CRUD call and adds business logic'."),
      project_path: z
        .string()
        .optional()
        .describe("Project root to search in (absolute or relative). Defaults to the first configured grep root."),
    },
    asTextTool(async ({ description, project_path }) => {
      const target = project_path
        ? resolvePathInRoots(project_path, grepRoots)
        : grepRoots[0];
      if (!target || !existsSync(target)) throw new Error(`project not found: ${project_path ?? grepRoots[0]}`);
      const systemPrompt = `You are a code-example finder. Use Glob and Grep to narrow candidates, then Read selected files to confirm they match the user's description. Output up to 5 matches as:
PATH: file:line-range
WHY: one sentence on why it matches.
SNIPPET: 5-15 verbatim lines from the file.
Stop early once you have good matches; do not exhaustively explore.`;
      return await router.execute(
        {
          systemPrompt,
          userPrompt: `Find examples of: ${description}`,
          projectPath: target,
        },
      );
    })
  );
}
