import { z } from "zod";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import { asTextTool } from "./_helpers.js";

/**
 * Confine transcript reads to known transcript locations. The default
 * Claude Code transcript dir is ~/.claude/projects/, plus alternate
 * profile dirs the user may use (claudea, claudeq, etc., conventionally
 * ~/.claude-<name>/projects/). Anything outside these roots is rejected
 * to prevent the tool from being used as an arbitrary file reader.
 */
function transcriptRootsAllowed() {
  const home = homedir();
  return [
    resolve(home, ".claude", "projects"),
    // Match ~/.claude-* profile dirs (claudea, claudeq, etc.)
    // by prefix-checking in assertInsideRoots below.
  ];
}

function assertSafeTranscriptPath(p) {
  if (!existsSync(p)) throw new Error(`transcript not found: ${p}`);
  let real;
  try {
    real = realpathSync(p);
  } catch (e) {
    throw new Error(`cannot resolve transcript path: ${p}`);
  }
  const home = homedir();
  const roots = transcriptRootsAllowed();
  const inExplicitRoot = roots.some((r) => real === r || real.startsWith(r + sep));
  // Also accept ~/.claude-<profile>/projects/ trees.
  const matchesProfilePattern = real.startsWith(home + sep + ".claude-") &&
    real.includes(sep + "projects" + sep);
  if (!inExplicitRoot && !matchesProfilePattern) {
    throw new Error(
      `refusing to read transcript outside ~/.claude*/projects/: ${real}`
    );
  }
  return real;
}

/**
 * Minimal chat peeker for Claude Code .jsonl transcripts. Drops everything
 * that isn't human-facing prose (tool calls, tool results, thinking blocks,
 * system reminders, command echoes), keeping only `user` text and `assistant`
 * `text` blocks. Each kept message is tagged with its 1-indexed .jsonl line
 * number so the caller can Read the original line for full context.
 */

const NOISE_PREFIXES = [
  "<system-reminder>",
  "<command-name>",
  "<command-message>",
  "<command-args>",
  "<command-stdout>",
  "<command-stderr>",
  "<local-command-",
  "<user-prompt-submit-hook>",
  "Caveat:",
  "[Request interrupted",
  "This session is being continued",
];

function isNoiseUserText(t) {
  if (!t) return true;
  const s = t.trimStart();
  return NOISE_PREFIXES.some((p) => s.startsWith(p));
}

function extractChat(jsonlPath) {
  const lines = readFileSync(jsonlPath, "utf8").split("\n");
  const entries = []; // { line, role, text }
  let skipped = 0;
  let firstTs;
  let lastTs;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw) continue;
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      skipped++;
      continue;
    }
    const lineNo = i + 1;
    const ts = obj.timestamp || obj.message?.timestamp;
    if (ts) {
      if (!firstTs) firstTs = ts;
      lastTs = ts;
    }
    if (obj.type === "user") {
      const msg = obj.message;
      if (!msg) {
        skipped++;
        continue;
      }
      if (typeof msg.content === "string") {
        if (isNoiseUserText(msg.content)) {
          skipped++;
          continue;
        }
        entries.push({ line: lineNo, role: "user", text: msg.content });
      } else if (Array.isArray(msg.content)) {
        let emitted = false;
        for (const c of msg.content) {
          if (c.type === "text" && !isNoiseUserText(c.text)) {
            entries.push({ line: lineNo, role: "user", text: c.text });
            emitted = true;
          }
          // tool_result blocks are dropped — they're not chat
        }
        if (!emitted) skipped++;
      } else {
        skipped++;
      }
    } else if (obj.type === "assistant") {
      const msg = obj.message;
      if (!msg || !Array.isArray(msg.content)) {
        skipped++;
        continue;
      }
      let emitted = false;
      for (const c of msg.content) {
        if (c.type === "text" && c.text) {
          entries.push({ line: lineNo, role: "assistant", text: c.text });
          emitted = true;
        }
        // tool_use and thinking blocks are dropped
      }
      if (!emitted) skipped++;
    } else {
      skipped++;
    }
  }
  return { entries, skipped, totalLines: lines.length, firstTs, lastTs };
}

/** Merge adjacent same-role same-text entries into a line range. */
function dedupAdjacent(entries) {
  const out = [];
  for (const e of entries) {
    const prev = out[out.length - 1];
    if (prev && prev.role === e.role && prev.text === e.text) {
      prev.lineEnd = e.line;
    } else {
      out.push({ ...e, lineEnd: e.line });
    }
  }
  return out;
}

function fmtTs(ts) {
  if (!ts) return "?";
  return ts.replace("T", " ").replace(/\..+$/, "").replace(/Z$/, "Z");
}

function formatHeader(path, entries, meta) {
  const userCount = entries.filter((e) => e.role === "user").length;
  const asstCount = entries.filter((e) => e.role === "assistant").length;
  const span =
    meta.firstTs && meta.lastTs
      ? `\nSPAN       ${fmtTs(meta.firstTs)} -> ${fmtTs(meta.lastTs)}`
      : "";
  return `TRANSCRIPT ${path}
TURNS      ${userCount} user, ${asstCount} assistant   (skipped ${meta.skipped} of ${meta.totalLines} lines)${span}`;
}

function formatEntry(e, maxCharsPerMsg) {
  const tag =
    e.lineEnd && e.lineEnd !== e.line
      ? `[L${e.line}-${e.lineEnd} ${e.role}]`
      : `[L${e.line} ${e.role}]`;
  let body = e.text;
  if (body.length > maxCharsPerMsg) {
    body =
      body.slice(0, maxCharsPerMsg) +
      ` ...[+${body.length - maxCharsPerMsg} chars, full at L${e.line}]`;
  }
  return `${tag}\n${body}`;
}

export function register(server) {
  server.tool(
    "inspect_transcript",
    "Show the human/assistant chat from a Claude Code session transcript (.jsonl), with all tool calls, tool results, thinking, system reminders, and command echoes stripped. Each message is tagged with its .jsonl line number (e.g. [L412 assistant]) so you can Read the original at that line for full context. Returns a header (turns, span) plus the tail of recent messages by default. **IMPORTANT: use whenever you are given a transcript path — including ones returned by other claude-review tools — and want to see what the human and assistant actually said. Do NOT Read the .jsonl yourself; transcripts are typically multi-MB.**",
    {
      transcript_path: z.string().describe("Absolute path to the .jsonl transcript file."),
      mode: z
        .enum(["tail", "head", "all"])
        .optional()
        .describe("Which slice of messages to show. Default 'tail'."),
      limit: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Number of messages to include (ignored if mode='all'). Default 80."),
      max_chars_per_msg: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Per-message truncation budget. Default 800."),
    },
    asTextTool(async ({ transcript_path, mode = "tail", limit = 80, max_chars_per_msg = 800 }) => {
      const safePath = assertSafeTranscriptPath(transcript_path);
      const raw = extractChat(safePath);
      if (raw.entries.length === 0) return "(no chat content found in transcript)";
      const entries = dedupAdjacent(raw.entries);
      let slice;
      if (mode === "all") slice = entries;
      else if (mode === "head") slice = entries.slice(0, limit);
      else slice = entries.slice(Math.max(0, entries.length - limit));
      const header = formatHeader(transcript_path, entries, {
        skipped: raw.skipped,
        totalLines: raw.totalLines,
        firstTs: raw.firstTs,
        lastTs: raw.lastTs,
      });
      const showing =
        mode === "all"
          ? `SHOWING    all ${entries.length} messages`
          : `SHOWING    ${mode} ${slice.length} of ${entries.length} messages`;
      const body = slice.map((e) => formatEntry(e, max_chars_per_msg)).join("\n\n");
      return `${header}\n${showing}\n\n${body}`;
    })
  );
}
