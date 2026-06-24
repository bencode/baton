import { existsSync } from 'node:fs'
import type { Id } from '@baton/shared'
import { type IPty, spawn } from 'node-pty'
import { WebSocket } from 'ws'
import type { WorkerConfig } from '../project-config.ts'
import { hasSessionJsonl, MAX_TERMINALS, ptyArgs, serverTerminalWsUrl } from './pty.ts'

export type TerminalManager = {
  open(sessionId: Id, agentSessionId: string, worktreePath: string): void
  close(sessionId: Id): void
  has(sessionId: Id): boolean
  killAll(): void
}

// Owns the live interactive terminals (one pty per session, separate from the
// headless children). Each terminal = `claude --resume` in a node-pty bridged to
// the server over an OUTBOUND WebSocket (no inbound port, no ttyd): pty output →
// ws → server → browser viewers; viewer input/resize (framed JSON) → ws → pty.
// The server drives close by dropping our WS (close button / idle-reaper), which
// kills the pty. `hasChild` is injected so a terminal never opens over a running
// headless child; MAX_TERMINALS caps concurrency.
export const createTerminalManager = (deps: {
  cfg: WorkerConfig
  log: (m: string) => void
  hasChild: (sessionId: Id) => boolean
}): TerminalManager => {
  const { cfg, log, hasChild } = deps
  const terminals = new Map<Id, { pty: IPty; ws: WebSocket }>()

  const open = (sessionId: Id, agentSessionId: string, worktreePath: string): void => {
    const why = terminals.has(sessionId)
      ? 'already open'
      : hasChild(sessionId)
        ? 'headless child running'
        : !existsSync(worktreePath)
          ? `worktree missing (${worktreePath})`
          : terminals.size >= MAX_TERMINALS
            ? `cap ${MAX_TERMINALS} reached`
            : null
    if (why) {
      log(`terminal #${sessionId}: ${why} — refusing`)
      return
    }

    const claudeBin = process.env.BATON_CLAUDE_BIN ?? 'claude'
    const term = spawn(claudeBin, ptyArgs(agentSessionId, hasSessionJsonl(agentSessionId)), {
      name: 'xterm-color',
      cols: 80,
      rows: 24,
      cwd: worktreePath,
      env: process.env as Record<string, string>,
    })
    const ws = new WebSocket(serverTerminalWsUrl(cfg.server, sessionId), {
      headers: { authorization: `Bearer ${cfg.apiToken}` },
    })
    terminals.set(sessionId, { pty: term, ws })

    // Any end dying tears down both halves. The guard avoids a stale teardown
    // clobbering a freshly reopened terminal for the same session.
    const teardown = (why: string): void => {
      if (terminals.get(sessionId)?.pty !== term) return
      terminals.delete(sessionId)
      log(`terminal #${sessionId} gone (${why})`)
      try {
        term.kill()
      } catch {
        // already exited
      }
      try {
        ws.close()
      } catch {
        // already closed
      }
    }

    term.onData(d => {
      if (ws.readyState === WebSocket.OPEN) ws.send(d) // raw pty output → server → viewers
    })
    term.onExit(() => teardown('pty exit'))
    ws.on('open', () => log(`terminal #${sessionId} bridged → ${cfg.server}`))
    ws.on('message', raw => {
      try {
        const m = JSON.parse(raw.toString()) as { t?: string; d?: string; c?: number; r?: number }
        if (m.t === 'i' && typeof m.d === 'string') term.write(m.d)
        else if (m.t === 'r' && m.c && m.r) term.resize(m.c, m.r)
      } catch (e) {
        log(`terminal #${sessionId}: bad control frame: ${String(e)}`)
      }
    })
    // The server closing our WS (close button / reaper / server gone) kills the pty.
    ws.on('close', () => teardown('server ws closed'))
    ws.on('error', e => teardown(`ws error: ${String(e)}`))
  }

  // Explicit close: drop the WS, which fires teardown → kills the pty.
  const close = (sessionId: Id): void => {
    const t = terminals.get(sessionId)
    if (!t) return
    log(`closing terminal #${sessionId}`)
    try {
      t.ws.close()
    } catch {
      // already closed; the exit/close handler will reap it
    }
  }

  return {
    open,
    close,
    has: sessionId => terminals.has(sessionId),
    killAll: () => {
      for (const { pty, ws } of terminals.values()) {
        try {
          pty.kill()
        } catch {
          // already exited
        }
        try {
          ws.close()
        } catch {
          // already closed
        }
      }
    },
  }
}
