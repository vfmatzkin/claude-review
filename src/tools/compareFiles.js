import { z } from "zod";
import { dirname } from "node:path";
import { resolvePathInRoots, loadProjectContext, safeReadFile } from "../context.js";
import { asTextTool } from "./_helpers.js";

export function register(server, { upstream, grepRoots }) {
  server.tool(
    "compare_files",
    "Compare two files at the meaning level (behavior, intent, or performance), not character level. Reads both files internally so you do not need to Read them yourself. **IMPORTANT: use this INSTEAD OF Read-then-reason whenever you need to know whether two implementations are equivalent, what changed in semantics between two versions of a file, or how two specs relate.** Returns SAME / DIFFERENT / VERDICT structure.",
    {
      path_a: z.string().describe("First file (absolute or relative to a grep root)."),
      path_b: z.string().describe("Second file (absolute or relative to a grep root)."),
      focus: z
        .enum(["behavior", "intent", "performance"])
        .default("behavior")
        .describe("What dimension to compare on."),
    },
    asTextTool(async ({ path_a, path_b, focus }) => {
      const absA = resolvePathInRoots(path_a, grepRoots);
      const absB = resolvePathInRoots(path_b, grepRoots);
      if (!absA) throw new Error(`file not found: ${path_a}`);
      if (!absB) throw new Error(`file not found: ${path_b}`);
      const a = safeReadFile(absA);
      const b = safeReadFile(absB);
      const projectContext = loadProjectContext(absA, { grepRoots });
      const baseSys = `You compare two files on a single dimension: ${focus}. Output exactly:
SAME: what is preserved across both files.
DIFFERENT: what is changed and why it matters for ${focus}.
VERDICT: one sentence on whether the difference is significant for ${focus}.
No fluff, no character-level diff, no markdown fences.`;
      const systemPrompt = projectContext
        ? `${baseSys}\n\nPROJECT CONTEXT:\n${projectContext}`
        : baseSys;
      const userPrompt = `Compare these two files for ${focus}. Respond with the SAME / DIFFERENT / VERDICT format from the system instructions.\n\n---FILE A: ${absA}---\n${a}\n\n---FILE B: ${absB}---\n${b}`;
      return await upstream.execute(
        { systemPrompt, userPrompt, projectPath: dirname(absA) },
      );
    })
  );
}
