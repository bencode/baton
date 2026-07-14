import { existsSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import type { EffortLevel } from '@anthropic-ai/claude-agent-sdk'
import type { ApprovalMode, ModelReasoningEffort, SandboxMode } from '@openai/codex-sdk'

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

const truthy = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined
  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false
  return undefined
}

export const codexNetworkAccess = (): boolean | undefined =>
  truthy(process.env.BATON_CODEX_NETWORK_ACCESS)

export const codexSandboxMode = (planMode: boolean): SandboxMode => {
  if (planMode) return 'read-only'
  const raw = process.env.BATON_CODEX_SANDBOX_MODE
  if (raw === 'read-only' || raw === 'workspace-write' || raw === 'danger-full-access') return raw
  return 'workspace-write'
}

export const codexApprovalPolicy = (): ApprovalMode => {
  const raw = process.env.BATON_CODEX_APPROVAL_POLICY
  if (raw === 'never' || raw === 'on-request' || raw === 'on-failure' || raw === 'untrusted')
    return raw
  return 'never'
}

// A session's effort (shared AgentEffort) is the union of what the two SDKs take;
// each SDK gets it narrowed to its own enum. Where a level has no counterpart we
// clamp to the nearest one the target supports rather than drop it — asking for
// more thinking and getting the most available beats silently getting the default.
// Anything unrecognized → undefined (the SDK's own default).

// claude-agent-sdk EffortLevel: low | medium | high | xhigh | max (no 'minimal').
export const claudeEffort = (raw: string | undefined): EffortLevel | undefined => {
  if (raw === 'minimal') return 'low'
  if (raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'xhigh' || raw === 'max')
    return raw
  return undefined
}

// codex-sdk ModelReasoningEffort: minimal | low | medium | high | xhigh (no 'max').
// The codex binary itself already knows 'ultra' above 'xhigh', but the SDK's
// typedef stops at 'xhigh' — until it catches up, 'max' clamps down to 'xhigh'.
export const codexEffort = (raw: string | undefined): ModelReasoningEffort | undefined => {
  if (raw === 'max') return 'xhigh'
  if (raw === 'minimal' || raw === 'low' || raw === 'medium' || raw === 'high' || raw === 'xhigh')
    return raw
  return undefined
}
