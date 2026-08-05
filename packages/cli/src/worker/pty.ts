import { existsSync, readdirSync } from 'node:fs'
import { createRequire as createModuleRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Hard ceiling on concurrent interactive terminals per worker — the backpressure
// against runaway ptys (the server-side idle-reaper recycles abandoned ones).
export const MAX_TERMINALS = 10

export type PtyCommand = { file: string; args: string[] }

// Resume the session's own JSONL if claude has written one, else start a fresh
// conversation at that id.
export const claudePtyCommand = (
  agentSessionId: string,
  hasJsonl: boolean,
  env: NodeJS.ProcessEnv = process.env,
): PtyCommand => ({
  file: env.BATON_CLAUDE_BIN?.trim() || 'claude',
  args: hasJsonl ? ['--resume', agentSessionId] : ['--session-id', agentSessionId],
})

const moduleRequire = createModuleRequire(import.meta.url)

// Codex SDK sessions originate from `codex exec`; the interactive TUI includes
// those sessions only when explicitly requested. Drive the packaged launcher
// through Node so workers do not need a separate global Codex installation.
export const codexPtyCommand = (
  agentSessionId: string,
  env: NodeJS.ProcessEnv = process.env,
): PtyCommand => {
  const args = ['resume', '--include-non-interactive', agentSessionId]
  const override = env.BATON_CODEX_BIN?.trim()
  return override
    ? { file: override, args }
    : {
        file: process.execPath,
        args: [moduleRequire.resolve('@openai/codex/bin/codex.js'), ...args],
      }
}

// Does claude already have a transcript for this session id? (~/.claude/projects/
// <project>/<agentSessionId>.jsonl — one level down, like the bash `find`.)
export const hasSessionJsonl = (agentSessionId: string): boolean => {
  const root = join(homedir(), '.claude', 'projects')
  if (!existsSync(root)) return false
  for (const dir of readdirSync(root))
    if (existsSync(join(root, dir, `${agentSessionId}.jsonl`))) return true
  return false
}

// The worker's outbound terminal-bridge URL. http(s)://server → ws(s):// so the
// pty WS rides the same host the worker already talks to (no inbound port).
export const serverTerminalWsUrl = (server: string, sessionId: number): string =>
  `${server.replace(/^http/, 'ws')}/workers/me/terminal/ws?sessionId=${sessionId}`

// A valid terminal dimension: a finite positive number. node-pty's resize throws
// on 0/negative/NaN/Infinity, so a resize frame must be vetted before it's applied.
export const isPositiveDim = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0
