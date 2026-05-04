import { execFileSync } from "node:child_process";

const GIT_TIMEOUT_MS = 30_000;

// Refs are caller-supplied via MCP arguments. Validate before passing
// to git so a ref like "--upload-pack=evil" can't become a flag, and
// so that exotic shell metacharacters can't sneak through.
const REF_RE = /^[A-Za-z0-9_./^~@{}+=:-]+$/;
function safeRef(ref, label) {
  if (typeof ref !== "string" || !REF_RE.test(ref)) {
    throw new Error(`invalid git ${label} ref: ${JSON.stringify(ref)}`);
  }
  return ref;
}

function runGit(args, cwd, maxBuffer = 16 * 1024 * 1024) {
  try {
    return execFileSync("git", args, {
      encoding: "utf8",
      cwd,
      maxBuffer,
      timeout: GIT_TIMEOUT_MS,
    });
  } catch (e) {
    // Some git subcommands (log -n0, diff with no changes, blame on a
    // file with no commits) exit 1 with useful stdout and no stderr.
    // Surface that. Anything that wrote to stderr is a real failure.
    if (e.status === 1 && e.stdout && !e.stderr) return e.stdout;
    const msg = e.stderr?.toString().trim() || e.message;
    throw new Error(`git ${args.join(" ")} failed: ${msg}`);
  }
}

export function gitLog(filePath, cwd, n = 20) {
  return runGit(["log", `-n${n}`, "--oneline", "--", filePath], cwd);
}

export function gitLogPatches(filePath, cwd, n = 5) {
  return runGit(["log", `-n${n}`, "-p", "--no-color", "--", filePath], cwd);
}

export function gitDiffRange(baseRef, headRef, cwd) {
  const a = safeRef(baseRef, "base");
  const b = safeRef(headRef, "head");
  return runGit(["diff", "--no-color", `${a}...${b}`], cwd);
}

