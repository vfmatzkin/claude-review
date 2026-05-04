import { z } from "zod";
import { dirname } from "node:path";
import { resolvePathInRoots, loadProjectContext, safeReadFile } from "../context.js";
import { gitLog, gitLogPatches } from "../git.js";
import { asTextTool } from "./_helpers.js";

export function register(server, { router, grepRoots }) {
  server.tool(
    "code_archaeology",
    "Explain why a piece of code looks the way it does, using its git history and project context. Pre-collects the file's recent commit log and patches, then answers a question about provenance / motivation / evolution. **IMPORTANT: use whenever the user asks 'why is this here', 'what was this trying to fix', or 'how did this evolve' for a specific file.** You do not need to run git yourself.",
    {
      file_path: z.string().describe("File to investigate (absolute or relative)."),
      question: z.string().describe("The historical / motivational question."),
      log_count: z.number().int().min(1).max(50).default(15).describe("How many recent commits to scan."),
      patch_count: z.number().int().min(0).max(15).default(5).describe("How many recent commits to include with full patches."),
    },
    asTextTool(async ({ file_path, question, log_count, patch_count }) => {
      const abs = resolvePathInRoots(file_path, grepRoots);
      if (!abs) throw new Error(`file not found: ${file_path}`);
      const cwd = dirname(abs);
      const body = safeReadFile(abs);
      const log = gitLog(abs, cwd, log_count);
      const patches = patch_count > 0 ? gitLogPatches(abs, cwd, patch_count) : "";
      const projectContext = loadProjectContext(abs, { grepRoots });
      const baseSys = `You are a code archaeologist. Given a file's current content, recent git history, and project context, answer questions about why the code looks the way it does. Cite specific commits when relevant. Output:
CONTEXT: one or two sentences setting the scene.
ANSWER: 4-8 sentences answering the question, citing commits or lines.
EVIDENCE: 3-6 verbatim lines or commit subjects supporting your answer.
No fences, no preamble.`;
      const systemPrompt = projectContext
        ? `${baseSys}\n\nPROJECT CONTEXT:\n${projectContext}`
        : baseSys;
      const userPrompt = [
        `Question: ${question}`,
        ``,
        `---FILE: ${abs}---`,
        body,
        ``,
        `---GIT LOG (last ${log_count})---`,
        log || "(no git history)",
        patches ? `\n---RECENT PATCHES (last ${patch_count})---\n${patches}` : "",
      ].join("\n");
      return await router.execute(
        { systemPrompt, userPrompt, projectPath: cwd, maxTokens: 4096 },
      );
    })
  );
}
