import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Id, WorkerCommand } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { ApiClient } from '../client.ts'
import { defaultWorktreeDir, slug } from '../commands/session/shared.ts'
import type { WorkerConfig } from '../project-config.ts'
import { createWorktree } from '../session/worktree.ts'

// The persistent, lightweight worker process. It owns no Claude state itself —
// it listens on the server→worker command stream and supervises one child
// process per session (`baton session run <id>`). Children are disposable: if
// one dies the worker just respawns it when the next command arrives. This is
// what makes the worker resilient and sessions cheap.

// Re-exec the CLI bin for the session child. The bin shim resolves tsx + the
// entry itself, preserving the dev runtime.
const binPath = (): string =>
  join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'bin', 'baton.mjs')

export const runWorkerDaemon = async (
  cfg: WorkerConfig,
  client: ApiClient,
  signal: AbortSignal,
): Promise<void> => {
  const repo = process.cwd()
  const worktreeDir = defaultWorktreeDir()
  const children = new Map<Id, ChildProcess>()
  const log = (m: string): void => console.log(`[worker #${cfg.workerId} ${cfg.name}] ${m}`)

  const ping = (): void => {
    void client.workers.heartbeat(cfg.machineId).catch(e => log(`heartbeat failed: ${String(e)}`))
  }
  ping()
  const hb = setInterval(ping, 30_000)

  // Kill the child AND its descendants. The bin shim re-execs tsx, so the child
  // is a small process tree; `detached` makes it a process-group leader and a
  // negative-pid signal tears down the whole group (no orphaned claude/tsx).
  const killChild = (child: ChildProcess): void => {
    if (child.pid === undefined) return
    try {
      process.kill(-child.pid, 'SIGTERM')
    } catch {
      // already gone
    }
  }

  // Spawn the session child, handing it the worker credentials via env so it can
  // authenticate session writes with the worker token.
  const spawnChild = (sessionId: Id): void => {
    if (children.has(sessionId)) return
    const child = spawn(process.execPath, [binPath(), 'session', 'run', String(sessionId)], {
      detached: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        BATON_SERVER: cfg.server,
        BATON_WORKER_TOKEN: cfg.apiToken,
        BATON_WORKER_MACHINE_ID: cfg.machineId,
      },
    })
    children.set(sessionId, child)
    child.on('exit', code => {
      children.delete(sessionId)
      log(`session #${sessionId} child exited (code=${code ?? -1})`)
    })
  }

  // Materialize on first sight (mint agentSessionId + git worktree, PATCH them
  // back), then spawn. Idempotent: a session that's already materialized (worker
  // restart) reuses the existing worktree and just respawns.
  const onCreate = async (sessionId: Id, name: string): Promise<void> => {
    if (children.has(sessionId)) return log(`session #${sessionId} already running`)
    const session = await client.sessions.get(sessionId)
    if (!session.agentSessionId || !session.worktreePath) {
      const agentSessionId = randomUUID()
      const worktreePath = join(worktreeDir, slug(`${name}-${agentSessionId.slice(0, 8)}`))
      createWorktree({ repo, worktreePath, sessionCode: agentSessionId.slice(0, 8), base: 'main' })
      await client.sessions.materialize(sessionId, { agentSessionId, worktreePath }, cfg.apiToken)
      log(`materialized session #${sessionId} → ${worktreePath}`)
    }
    spawnChild(sessionId)
    log(`spawned session #${sessionId} (${name})`)
  }

  const onDelete = (sessionId: Id): void => {
    const child = children.get(sessionId)
    if (!child) return
    killChild(child)
    children.delete(sessionId)
    log(`stopped session #${sessionId}`)
  }

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
  es.onmessage = e => {
    try {
      const cmd = JSON.parse(e.data) as WorkerCommand
      if (cmd.cmd === 'session.create')
        void onCreate(cmd.sessionId, cmd.name).catch(err => log(`create failed: ${String(err)}`))
      else if (cmd.cmd === 'session.delete') onDelete(cmd.sessionId)
    } catch {
      // skip malformed commands
    }
  }
  es.onerror = () => log('command stream error (eventsource will retry)')
  log(`listening for commands (server ${cfg.server}, repo ${repo})`)

  await new Promise<void>(resolve => {
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
  es.close()
  clearInterval(hb)
  for (const child of children.values()) killChild(child)
}
