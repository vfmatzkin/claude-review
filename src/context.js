import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname, join, isAbsolute } from "node:path";

/**
 * Resolve a possibly-relative path against a list of grep root directories.
 * Returns the first absolute path that exists, or null.
 */
export function resolvePathInRoots(filePath, roots) {
  if (isAbsolute(filePath)) {
    return existsSync(filePath) ? filePath : null;
  }
  for (const root of roots) {
    const candidate = resolve(root, filePath);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Walk up from a file path collecting CLAUDE.md and .claude/CLAUDE.md, mirroring
 * what Claude Code itself loads. Stop at $HOME, the filesystem root, or the
 * parent of any grep root (whichever comes first). Output is ordered root-most
 * first so the most general guidance comes before the most specific.
 */
export function loadProjectContext(absFilePath, { grepRoots = [], maxChars = 30_000 } = {}) {
  const home = process.env.HOME || "/";
  const stops = new Set([home, "/", ...grepRoots.map((p) => resolve(p, ".."))]);
  const found = [];
  let dir = dirname(absFilePath);
  let total = 0;
  while (dir && !stops.has(dir)) {
    for (const candidate of [
      join(dir, "CLAUDE.md"),
      join(dir, ".claude", "CLAUDE.md"),
    ]) {
      if (!existsSync(candidate)) continue;
      try {
        const txt = readFileSync(candidate, "utf8");
        const remaining = maxChars - total;
        if (remaining <= 0) break;
        if (txt.length > remaining) {
          found.push(`# ${candidate}\n[truncated to fit budget]\n${txt.slice(0, remaining)}`);
          total = maxChars;
        } else {
          found.push(`# ${candidate}\n${txt}`);
          total += txt.length;
        }
      } catch {}
    }
    if (total >= maxChars) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return found.reverse().join("\n\n");
}

/**
 * Read a file as utf8 with a hard size cap. Throws if missing or too large.
 */
export function safeReadFile(absPath, maxBytes = 800_000) {
  if (!existsSync(absPath)) throw new Error(`file not found: ${absPath}`);
  const size = statSync(absPath).size;
  if (size > maxBytes) {
    throw new Error(`file too large (${size} bytes, limit ${maxBytes}); split or pre-filter first`);
  }
  return readFileSync(absPath, "utf8");
}

/**
 * Number a multi-line string with 1-based line numbers, "N: line".
 */
export function numberLines(text) {
  return text.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");
}
