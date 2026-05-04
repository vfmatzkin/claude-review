import { spawn } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// Cap output captured from a single subprocess. A claude session can
// emit megabytes of intermediate text; without a cap, a runaway can
// OOM the MCP server before the timeout fires.
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

// Env vars deliberately stripped before spawning a subprocess. The
// subprocess inherits PATH/HOME/etc. but not credentials it doesn't
// need — a compromised claude session or malicious MCP it loads
// shouldn't be handed every secret in the parent's env. Pattern-match
// to catch *_KEY / *_TOKEN / *_SECRET broadly without a fixed list.
const SECRET_ENV_PATTERN = /(_KEY|_TOKEN|_SECRET|_PASSWORD|_PASSWD|API_KEY)$/;
function sanitizeEnv(parent) {
  const out = {};
  for (const [k, v] of Object.entries(parent)) {
    if (SECRET_ENV_PATTERN.test(k)) continue;
    out[k] = v;
  }
  return out;
}

// Track active children for graceful shutdown.
const activeChildren = new Set();
let signalsBound = false;
function bindShutdownHandlers() {
  if (signalsBound) return;
  signalsBound = true;
  const cleanup = () => {
    for (const c of activeChildren) {
      try { c.kill("SIGTERM"); } catch {}
    }
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

/**
 * Spawns the configured `claude` binary as a subprocess. Slow (10-90s)
 * but inherits Claude Code's project awareness: auto-loads CLAUDE.md
 * trees from cwd, can use Read/Glob/Grep, applies hooks/skills.
 *
 * Routing (Anthropic direct vs. third-party provider) is the user's
 * responsibility, configured outside this MCP via the binary it
 * spawns or the CLAUDE_CONFIG_DIR profile it points at.
 */
export class ClaudeUpstream {
  constructor({
    claudeBin = "claude",
    claudeConfigDir,
    defaultTimeoutMs = 180_000,
  }) {
    this.claudeBin = claudeBin;
    this.claudeConfigDir = claudeConfigDir;
    this.defaultTimeoutMs = defaultTimeoutMs;
  }

  _effectiveConfigDir() {
    return (
      this.claudeConfigDir ||
      process.env.CLAUDE_CONFIG_DIR ||
      join(homedir(), ".claude")
    );
  }

  _projectsDirFor(cwd) {
    if (!cwd) return null;
    const encoded = cwd.replace(/[^a-zA-Z0-9-]/g, "-");
    return join(this._effectiveConfigDir(), "projects", encoded);
  }

  _snapshotJsonl(dir) {
    if (!dir || !existsSync(dir)) return new Map();
    const map = new Map();
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".jsonl")) continue;
      try {
        map.set(join(dir, f), statSync(join(dir, f)).mtimeMs);
      } catch {}
    }
    return map;
  }

  _findTranscript(dir, snapshotBefore) {
    if (!dir || !existsSync(dir)) return null;
    const after = this._snapshotJsonl(dir);
    let best = null;
    let bestMtime = -1;
    for (const [path, mtime] of after) {
      const before = snapshotBefore.get(path);
      const grew = before === undefined || mtime > before;
      if (grew && mtime > bestMtime) {
        best = path;
        bestMtime = mtime;
      }
    }
    return best;
  }

  async execute({ systemPrompt, userPrompt, projectPath, timeoutMs }) {
    bindShutdownHandlers();
    const env = sanitizeEnv(process.env);
    if (this.claudeConfigDir) env.CLAUDE_CONFIG_DIR = this.claudeConfigDir;
    // The spawned claude inherits its profile's full MCP/tool config; we
    // intentionally don't constrain via --allowedTools so the review session
    // can use whatever its profile authorizes (read, grep, project MCPs, etc).
    const args = ["-p", userPrompt, "--output-format", "text"];
    if (systemPrompt) args.push("--append-system-prompt", systemPrompt);

    const projectsDir = this._projectsDirFor(projectPath);
    const snapshotBefore = this._snapshotJsonl(projectsDir);

    const effectiveTimeout = timeoutMs ?? this.defaultTimeoutMs;
    const text = await new Promise((resolveP, rejectP) => {
      const child = spawn(this.claudeBin, args, { cwd: projectPath, env });
      activeChildren.add(child);

      // Bounded output capture. Past the cap we drop further chunks and
      // append a marker so the caller knows truncation happened.
      let stdout = "";
      let stderr = "";
      let truncated = false;
      const capture = (which) => (d) => {
        const cur = which === "stdout" ? stdout : stderr;
        if (cur.length >= MAX_OUTPUT_BYTES) {
          if (!truncated) {
            truncated = true;
            stdout += "\n[output truncated at MAX_OUTPUT_BYTES]\n";
          }
          return;
        }
        const remaining = MAX_OUTPUT_BYTES - cur.length;
        const slice = d.length > remaining ? d.slice(0, remaining) : d;
        if (which === "stdout") stdout += slice; else stderr += slice;
      };
      child.stdout.on("data", capture("stdout"));
      child.stderr.on("data", capture("stderr"));

      const timer = setTimeout(() => {
        try { child.kill("SIGTERM"); } catch {}
        // Force-kill if still alive after a grace period so buffers
        // drain and the process is reaped.
        setTimeout(() => { try { child.kill("SIGKILL"); } catch {} }, 5000);
        rejectP(new Error(`claude timed out after ${effectiveTimeout}ms`));
      }, effectiveTimeout);

      child.on("error", (e) => {
        clearTimeout(timer);
        activeChildren.delete(child);
        rejectP(new Error(`failed to spawn ${this.claudeBin}: ${e.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        activeChildren.delete(child);
        if (code === 0) {
          resolveP(stdout.trim() || "(empty response)");
        } else {
          // Surface BOTH stdout (often a partial-but-useful response)
          // and stderr (the actual error). Cap each excerpt.
          const errExcerpt = stderr.slice(-1000).trim();
          const outExcerpt = stdout.slice(-1000).trim();
          const detail = [
            errExcerpt && `stderr: ${errExcerpt}`,
            outExcerpt && `stdout (partial): ${outExcerpt}`,
          ].filter(Boolean).join("\n---\n");
          rejectP(new Error(`claude exited ${code}\n${detail || "(no output)"}`));
        }
      });
    });

    const transcriptPath = this._findTranscript(projectsDir, snapshotBefore);
    return { text, source: "claude", transcriptPath };
  }
}

/**
 * Single-upstream router. Kept as a seam in case future versions add
 * fallbacks; today it just forwards to the primary.
 */
export class Router {
  constructor({ primary }) {
    if (!primary) throw new Error("Router needs a primary upstream");
    this.primary = primary;
  }

  async execute(opts) {
    return await this.primary.execute(opts);
  }
}
