#!/usr/bin/env node
/**
 * claude-review-mcp — entrypoint
 *
 * Gives Claude Code 10 review/research tools, each backed by an
 * isolated `claude` subprocess. Routing (stock Anthropic, a custom
 * binary, or a separate profile dir) is the user's choice.
 *
 * Env:
 *   REVIEW_CLAUDE_BIN         binary to spawn for each review
 *                             (default 'claude')
 *   REVIEW_CLAUDE_CONFIG_DIR  CLAUDE_CONFIG_DIR for spawned subprocesses,
 *                             so the review session uses an isolated
 *                             profile (model, MCP servers, settings)
 *                             rather than this session's own profile.
 *                             Default: inherit from current env.
 *   REVIEW_PROJECT            default process.cwd()
 *   REVIEW_GLOSSARY_PATH      optional glossary file
 *   REVIEW_DOMAIN_HINT        one-line project description for prompts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { ClaudeUpstream, Router } from "./src/upstream.js";

import * as readWithQuestion from "./src/tools/readWithQuestion.js";
import * as researchProject from "./src/tools/researchProject.js";
import * as compareFiles from "./src/tools/compareFiles.js";
import * as findExamplesOf from "./src/tools/findExamplesOf.js";
import * as investigateFailingTest from "./src/tools/investigateFailingTest.js";
import * as auditPr from "./src/tools/auditPr.js";
import * as codeArchaeology from "./src/tools/codeArchaeology.js";
import * as inspectTranscript from "./src/tools/inspectTranscript.js";
import * as domainGlossaryLookup from "./src/tools/domainGlossaryLookup.js";
import * as grepCompanyCode from "./src/tools/grepCompanyCode.js";

const config = {
  project: process.env.REVIEW_PROJECT || process.cwd(),
  claudeBin: process.env.REVIEW_CLAUDE_BIN || "claude",
  claudeConfigDir: process.env.REVIEW_CLAUDE_CONFIG_DIR,
  glossaryPath: process.env.REVIEW_GLOSSARY_PATH,
  domainHint:
    process.env.REVIEW_DOMAIN_HINT || "the current software project",
};

const primary = new ClaudeUpstream({
  claudeBin: config.claudeBin,
  claudeConfigDir: config.claudeConfigDir,
});
const router = new Router({ primary });

const server = new McpServer({ name: "claude-review-mcp", version: "0.1.0" });

const deps = {
  router,
  grepRoots: [config.project],
  glossaryPath: config.glossaryPath,
  domainHint: config.domainHint,
};

const modules = [
  readWithQuestion,
  researchProject,
  compareFiles,
  findExamplesOf,
  investigateFailingTest,
  auditPr,
  codeArchaeology,
  inspectTranscript,
  domainGlossaryLookup,
  grepCompanyCode,
];
for (const m of modules) m.register(server, deps);

if (process.argv.includes("--selftest")) {
  console.error(`[selftest] claude bin: ${config.claudeBin}`);
  console.error(`[selftest] claude config dir: ${config.claudeConfigDir ?? "(inherited)"}`);
  console.error(`[selftest] project: ${config.project}`);
  console.error(`[selftest] tools registered: ${modules.length}`);
  try {
    const out = await primary.execute({
      systemPrompt: "You answer in one short sentence.",
      userPrompt: "Say 'selftest ok' and nothing else.",
      timeoutMs: 60_000,
    });
    console.error(`[selftest claude] OK: ${out.text.replace(/\s+/g, " ").slice(0, 120)}`);
    process.exit(0);
  } catch (e) {
    console.error(`[selftest claude] FAIL: ${e.message}`);
    process.exit(1);
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
console.error(
  `[claude-review-mcp] ready on stdio. ${modules.length} tools registered. bin=${config.claudeBin}`
);
