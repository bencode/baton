import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Hard ceiling on concurrent interactive terminals per worker — the backpressure
// against runaway ptys (the server-side idle-reaper recycles abandoned ones).
export const MAX_TERMINALS = 10

// Resume the session's own JSONL if claude has written one, else start a fresh
// conversation at that id (same rule the old ttyd bash wrapper used).
export const ptyArgs = (agentSessionId: string, hasJsonl: boolean): string[] =>
  hasJsonl ? ['--resume', agentSessionId] : ['--session-id', agentSessionId]

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
