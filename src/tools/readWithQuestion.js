import { z } from "zod";
import { dirname } from "node:path";
import { resolvePathInRoots, loadProjectContext, safeReadFile, numberLines } from "../context.js";
import { asTextTool } from "./_helpers.js";

export function register(server, { router, grepRoots }) {
  server.tool(
    "read_with_question",
    "Read a file and answer a focused question about it WITHOUT loading the file body into your context. Returns only the answer plus a few cited lines, never the full file. **IMPORTANT: use this INSTEAD OF the Read tool whenever you only need to answer a specific question about a file rather than seeing its full content.** Especially valuable for files > 500 lines, but works for any size.",
    {
      file_path: z.string().describe("Absolute path or path relative to a configured grep root."),
      question: z.string().describe("The focused question to answer about the file."),
    },
    asTextTool(async ({ file_path, question }) => {
      const abs = resolvePathInRoots(file_path, grepRoots);
      if (!abs) throw new Error(`file not found in grep roots: ${file_path}`);
      const body = safeReadFile(abs, 200_000);
      const projectContext = loadProjectContext(abs, { grepRoots });
      const baseSys = `You answer focused questions about a file. Reply with: ANSWER (3-8 sentences). KEY LINES (verbatim from the file with line numbers in brackets, max 8). If the file does not contain the answer, say so plainly. No markdown fences, no preamble.`;
      const systemPrompt = projectContext
        ? `${baseSys}\n\nPROJECT CONTEXT (loaded from CLAUDE.md files in the file's directory tree, treat as authoritative on conventions):\n${projectContext}`
        : baseSys;
      const userPrompt = `Question: ${question}\n\n---FILE: ${abs}---\n${numberLines(body)}`;
      return await router.execute(
        { systemPrompt, userPrompt, projectPath: dirname(abs), maxTokens: 4096 },
      );
    })
  );
}
