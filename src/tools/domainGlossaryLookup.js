import { z } from "zod";
import { readFileSync, existsSync } from "node:fs";
import { asTextTool } from "./_helpers.js";

export function register(server, { router, glossaryPath, domainHint }) {
  const glossaryText = glossaryPath && existsSync(glossaryPath) ? readFileSync(glossaryPath, "utf8") : "";
  const domain = domainHint || "this team's domain";

  server.tool(
    "domain_glossary_lookup",
    "Look up an internal company or domain term that Claude's general training does not cover (project-specific abbreviations, in-house product names, team jargon, regulated-industry vocabulary). Backed by a domain glossary maintained by the team. **IMPORTANT: call this proactively whenever you encounter an unfamiliar abbreviation, acronym, or specialized term in code, tickets, comments, or commit messages — do not guess from context.** Returns a grounded definition with project-specific usage notes.",
    {
      term: z.string().describe("The term, abbreviation, or short phrase to look up."),
      context: z
        .string()
        .optional()
        .describe("Optional surrounding code or sentence so the lookup can disambiguate."),
    },
    asTextTool(async ({ term, context }) => {
      const baseRole = `You are an internal domain glossary service for ${domain}. Answer concisely (3-6 sentences): definition, how the term is used in this domain specifically, and one example of where it might show up in code or operations.`;
      const systemPrompt = glossaryText
        ? `${baseRole} Use the curated notes below as ground truth; supplement from general knowledge only where the notes are silent. Mark anything not directly supported by the notes as "(inferred)".\n\n---NOTES---\n${glossaryText}`
        : `${baseRole} If a term is not unambiguous from general industry knowledge, give your best inference and clearly mark it as "(inferred — verify with team)".`;
      const userPrompt = context ? `Term: ${term}\nContext: ${context}` : `Term: ${term}`;
      return await router.execute(
        { systemPrompt, userPrompt, maxTokens: 1024 },
      );
    })
  );
}
