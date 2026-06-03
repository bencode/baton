import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'

// Environment for the SDK's claude subprocess. When the SDK `env` option is
// omitted the subprocess inherits `process.env` wholesale (carrying whatever
// ANTHROPIC_BASE_URL / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_API_KEY the worker was
// started with — the gateway auth path proven against increa-reader). We only
// build an explicit env when a per-turn overlay needs to win over the ambient
// one; then we still spread process.env first so auth keys survive.
export const buildSdkEnv = (
  overlay?: Record<string, string>,
): Record<string, string | undefined> | undefined =>
  overlay ? { ...process.env, ...overlay } : undefined

// Optional override for which claude binary the SDK drives. Unset → the SDK's
// bundled CLI. Named to match the old spawn path's BATON_CLAUDE_BIN so existing
// worker configs keep pointing at the same binary.
export const claudeExecutable = (): string | undefined => process.env.BATON_CLAUDE_BIN

// Extra workspace roots beyond the session worktree (the SDK's --add-dir). The
// worker mounts read-only reference repos (e.g. /resources/<repo>) so the agent
// can grep/read real source when asked "how is X wired" — without these it only
// sees its own worktree and falls back to asking the user. Worker-level (same
// for every session): PATH-style colon-separated ABSOLUTE paths. Non-absolute or
// missing entries are dropped so a stale path can't break every turn.
export const additionalDirs = (): string[] | undefined => {
  const raw = process.env.BATON_ADD_DIRS
  if (!raw) return undefined
  const dirs = raw
    .split(':')
    .map(s => s.trim())
    .filter(s => s !== '' && isAbsolute(s) && existsSync(s))
  return dirs.length > 0 ? dirs : undefined
}
