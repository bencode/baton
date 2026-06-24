import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Id } from '@baton/shared'
import type { ApiClient } from '../client.ts'
import type { WorkerConfig } from '../project-config.ts'
import { killProcessGroup } from './proc.ts'
import { buildTtydArgs, exposeNetwork, TTYD_PORTS, terminalBase, waitForPort } from './ttyd.ts'

export type TerminalManager = {
  open(sessionId: Id, agentSessionId: string, worktreePath: string): void
  close(sessionId: Id): void
  has(sessionId: Id): boolean
  killAll(): void
}

// Owns the live interactive ttyd terminals (one per session, separate from the
// headless children). A terminal serves `claude --resume` in the worktree —
// hands-on, alongside the relay. Long-lived (unlike the per-turn child), so capped
// by the port pool; `--once` frees a port when its iframe disconnects. `hasChild`
// is injected so a terminal never opens over a running headless child.
export const createTerminalManager = (deps: {
  client: ApiClient
  cfg: WorkerConfig
  log: (m: string) => void
  hasChild: (sessionId: Id) => boolean
}): TerminalManager => {
  const { client, cfg, log, hasChild } = deps
  const terminals = new Map<Id, { proc: ChildProcess; port: number }>()

  const reportNull = (sessionId: Id): void => {
    void client.sessions
      .reportTerminalUrl(sessionId, null, cfg.apiToken)
      .catch(err => log(`terminal #${sessionId} report-null failed: ${String(err)}`))
  }
  // First port in the pool not held by a live terminal; null = pool full.
  const freePort = (): number | null => {
    const used = new Set([...terminals.values()].map(t => t.port))
    return TTYD_PORTS.find(p => !used.has(p)) ?? null
  }

  // agentSessionId/worktreePath come from the command, so there's NO await before
  // we reserve the slot — a concurrent session.start can't sneak the headless child
  // in (the hasChild guard is the backstop).
  const open = (sessionId: Id, agentSessionId: string, worktreePath: string): void => {
    if (terminals.has(sessionId)) {
      log(`terminal #${sessionId} already open`)
      return
    }
    if (hasChild(sessionId)) {
      log(`terminal #${sessionId}: headless child running — refusing`)
      return
    }
    if (!existsSync(worktreePath)) {
      log(`terminal #${sessionId}: worktree missing (${worktreePath}) — refusing`)
      reportNull(sessionId)
      return
    }
    const port = freePort()
    if (port === null) {
      log(`terminal #${sessionId}: port pool full (${TTYD_PORTS.length}) — refusing`)
      reportNull(sessionId)
      return
    }
    const claudeBin = process.env.BATON_CLAUDE_BIN ?? 'claude'
    const args = buildTtydArgs({
      port,
      exposeNetwork: exposeNetwork(),
      worktreePath,
      agentSessionId,
      claudeBin,
    })
    const proc = spawn('ttyd', args, { detached: true, stdio: 'inherit', env: process.env })
    terminals.set(sessionId, { proc, port }) // reserve synchronously — no await gap
    // Either exit (--once after the browser left, explicit close, crash) or a spawn
    // error (ttyd not installed) drops the entry + reports null so the UI collapses.
    const teardown = (why: string): void => {
      if (terminals.get(sessionId)?.proc !== proc) return
      terminals.delete(sessionId)
      log(`terminal #${sessionId} gone (${why})`)
      reportNull(sessionId)
    }
    proc.on('exit', code => teardown(`ttyd exit ${code ?? -1}`))
    proc.on('error', err => teardown(`ttyd spawn error: ${String(err)} — is ttyd installed?`))
    void waitForPort(port)
      .then(() => {
        const url = `${terminalBase()}:${port}`
        log(`terminal #${sessionId} → ${url}`)
        return client.sessions.reportTerminalUrl(sessionId, url, cfg.apiToken)
      })
      .catch(e => {
        log(`terminal #${sessionId} failed to start: ${String(e)}`)
        killProcessGroup(proc) // exit handler clears the entry + reports null
      })
  }

  // Explicit teardown (close command / session stop / delete). killProcessGroup
  // fires proc.on('exit') → teardown removes the entry and reports null.
  const close = (sessionId: Id): void => {
    const t = terminals.get(sessionId)
    if (!t) return
    log(`closing terminal #${sessionId}`)
    killProcessGroup(t.proc)
  }

  return {
    open,
    close,
    has: sessionId => terminals.has(sessionId),
    killAll: () => {
      for (const { proc } of terminals.values()) killProcessGroup(proc)
    },
  }
}
