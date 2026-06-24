import type { WorkerCommand } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { ApiClient } from '../client.ts'
import type { WorkerConfig } from '../project-config.ts'
import { createLiveness } from './liveness.ts'
import { createSessionSupervisor } from './session-supervisor.ts'
import { createTerminalManager } from './terminal-manager.ts'

const ES_OPEN = 1 // WHATWG EventSource.readyState: 0 CONNECTING, 1 OPEN, 2 CLOSED

// The persistent, lightweight worker process. It owns no Claude state itself — it
// listens on the server→worker command stream and dispatches each command to one
// of two managers: the session supervisor (a disposable headless child per session)
// and the terminal manager (interactive node-pty terminals). A self-watchdog (liveness)
// exits non-zero if the heartbeat or the stream wedges, so the OS supervisor
// (docker restart / launchd KeepAlive) respawns a clean worker that re-subscribes.
export const runWorkerDaemon = async (
  cfg: WorkerConfig,
  client: ApiClient,
  signal: AbortSignal,
): Promise<void> => {
  const log = (m: string): void => console.log(`[worker #${cfg.workerId} ${cfg.name}] ${m}`)

  // Cross-wired by lazy callbacks: the supervisor skips a headless start while a
  // terminal owns the session and tears a terminal down on stop/delete; the terminal
  // manager refuses to open over a running child. The arrows run only when a command
  // arrives, so referencing `terminals` before its declaration is safe.
  const supervisor = createSessionSupervisor({
    client,
    cfg,
    repo: process.cwd(),
    log,
    hasTerminal: id => terminals.has(id),
    closeTerminal: id => terminals.close(id),
  })
  const terminals = createTerminalManager({
    cfg,
    log,
    hasChild: id => supervisor.has(id),
  })

  let fatal = false
  let stop: () => void = () => {}
  const liveness = createLiveness({
    client,
    cfg,
    log,
    isStreamOpen: () => es.readyState === ES_OPEN,
    onTrip: reason => {
      if (fatal) return
      log(`${reason} — exiting so the supervisor restarts a clean worker`)
      fatal = true
      stop()
    },
  })

  const es = new EventSource(`${cfg.server}/workers/me/stream`, {
    fetch: (url, init) =>
      fetch(url, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string>),
          authorization: `Bearer ${cfg.apiToken}`,
        },
      }),
  })
  es.onopen = () => {
    liveness.markStreamOk()
    void supervisor.reconcile().catch(err => log(`reconcile failed: ${String(err)}`))
  }
  es.onmessage = e => {
    liveness.markStreamOk()
    try {
      const cmd = JSON.parse(e.data) as WorkerCommand
      if (cmd.cmd === 'session.start')
        void supervisor
          .start(cmd.sessionId, cmd.name)
          .catch(err => log(`start failed: ${String(err)}`))
      else if (cmd.cmd === 'session.stop') supervisor.stop(cmd.sessionId)
      else if (cmd.cmd === 'session.delete') supervisor.remove(cmd.sessionId, cmd.worktreePath)
      else if (cmd.cmd === 'session.title')
        void supervisor
          .title(cmd.sessionId, cmd.agentSessionId, cmd.worktreePath)
          .catch(err => log(`title failed: ${String(err)}`))
      else if (cmd.cmd === 'session.terminal') {
        if (cmd.action === 'open')
          terminals.open(cmd.sessionId, cmd.agentSessionId, cmd.worktreePath)
        else terminals.close(cmd.sessionId)
      }
    } catch {
      // skip malformed commands
    }
  }
  es.onerror = () => log('command stream error (eventsource will retry)')
  log(`listening for commands (server ${cfg.server}, repo ${process.cwd()})`)

  liveness.start()

  await new Promise<void>(resolve => {
    stop = resolve
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
  es.close()
  liveness.stop()
  supervisor.killAll()
  terminals.killAll()
  // Watchdog exit: cleanup ran above, now hand a non-zero code to the supervisor.
  if (fatal) process.exit(1)
}
