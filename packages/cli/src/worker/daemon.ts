import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Id, WorkerCommand } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { ApiClient } from '../client.ts'
import { defaultWorktreeDir, slug } from '../commands/session/shared.ts'
import {
  PROJECT_CONFIG_NAME,
  saveProjectConfig,
  type WorkerConfig,
  worktreeConfig,
} from '../project-config.ts'
import { generateTitle } from '../session/runner/title.ts'
import { readFirstExchange } from '../session/runner/transcript.ts'
import {
  createWorktree,
  ensureExcluded,
  removeWorktree,
  repoHeadBranch,
} from '../session/worktree.ts'

// The persistent, lightweight worker process. It owns no Claude state itself —
// it listens on the server→worker command stream and supervises one child
// process per session (`baton session run <id>`). Children are disposable: if
// one dies the worker just respawns it when the next command arrives. This is
// what makes the worker resilient and sessions cheap.

// Node-runnable entry to re-exec for the session child (`baton session run`).
// Dev: the tsx shim (bin/baton.mjs) that loads src/index.ts. Published bundle:
// no bin/ is shipped, so import.meta.url IS the bundle — re-exec it directly.
const binPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url))
  const devShim = join(here, '..', '..', 'bin', 'baton.mjs')
  return existsSync(devShim) ? devShim : fileURLToPath(import.meta.url)
}

export const runWorkerDaemon = async (
  cfg: WorkerConfig,
  client: ApiClient,
  signal: AbortSignal,
): Promise<void> => {
  const repo = process.cwd()
  const worktreeDir = defaultWorktreeDir()
  // Track the worktree path alongside the child so we can git-remove it on
  // delete — by then the server row is gone, so we can't re-fetch it.
  const children = new Map<Id, { child: ChildProcess; worktreePath: string }>()
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
  const spawnChild = (sessionId: Id, worktreePath: string): void => {
    if (children.has(sessionId)) return
    const child = spawn(process.execPath, [binPath(), 'session', 'run', String(sessionId)], {
      detached: true,
      stdio: 'inherit',
      env: {
        ...process.env,
        BATON_SERVER: cfg.server,
        BATON_WORKER_TOKEN: cfg.apiToken,
      },
    })
    children.set(sessionId, { child, worktreePath })
    log(`spawned session #${sessionId} (${worktreePath})`)
    // The child reports itself active once its stream subscription is open (see
    // runner.ts) — so `attached` means "ready to receive", not just "spawned".
    // We only own the inactive report here (on exit), which is the reliable
    // signal even if the child crashes.
    child.on('exit', code => {
      children.delete(sessionId)
      log(`session #${sessionId} child exited (code=${code ?? -1})`)
      // Report inactive; best-effort (404 is fine if the session was deleted).
      void client.sessions.setStatus(sessionId, false, cfg.apiToken).catch(() => {})
    })
  }

  // Materialize on first sight (mint agentSessionId + git worktree, PATCH them
  // back), then spawn. Idempotent: a session that's already materialized (worker
  // restart) reuses the existing worktree and just respawns.
  const onStart = async (sessionId: Id, name: string): Promise<void> => {
    if (children.has(sessionId)) return log(`session #${sessionId} already running`)
    const session = await client.sessions.get(sessionId)
    let worktreePath = session.worktreePath
    if (!session.agentSessionId || !worktreePath) {
      const agentSessionId = randomUUID()
      worktreePath = join(worktreeDir, slug(`${name}-${agentSessionId.slice(0, 8)}`))
      createWorktree({
        repo,
        worktreePath,
        sessionCode: agentSessionId.slice(0, 8),
        base: repoHeadBranch(repo),
      })
      await client.sessions.materialize(sessionId, { agentSessionId, worktreePath }, cfg.apiToken)
      log(`materialized session #${sessionId} → ${worktreePath}`)
    }
    // Drop the worker's baton context into the worktree so the agent's bare
    // `baton` calls resolve server/project/worker from cwd. Overwrite every
    // start (refreshes a rotated token; no live child yet, so no race), and
    // keep the token-bearing file out of agent commits via info/exclude.
    ensureExcluded(repo, PROJECT_CONFIG_NAME)
    saveProjectConfig(join(worktreePath, PROJECT_CONFIG_NAME), worktreeConfig(cfg))
    spawnChild(sessionId, worktreePath)
  }

  // Stop: kill the child but keep the worktree (session goes inactive, can be
  // resumed). The child's exit handler reports active=false.
  const onStop = (sessionId: Id): void => {
    const entry = children.get(sessionId)
    if (!entry) return
    killChild(entry.child)
    children.delete(sessionId)
    log(`stopped session #${sessionId}`)
  }

  // Delete: kill the child (if tracked) AND remove the worktree. The path comes
  // from our tracked entry, or from the command itself when we aren't tracking a
  // child for it (e.g. delete after a worker restart).
  const onDelete = (sessionId: Id, worktreePath: string | null): void => {
    const entry = children.get(sessionId)
    if (entry) {
      killChild(entry.child)
      children.delete(sessionId)
    }
    const wt = entry?.worktreePath ?? worktreePath
    if (wt) removeWorktree(repo, wt)
    log(`deleted session #${sessionId} (removed worktree)`)
  }

  // Auto-title (frontend-triggered after the first turn): read the session's own
  // transcript for context, generate a short name with a throwaway claude call,
  // and PATCH it back. The server drops it if the user has locked the name.
  const onTitle = async (
    sessionId: Id,
    agentSessionId: string,
    worktreePath: string,
  ): Promise<void> => {
    const exchange = readFirstExchange(agentSessionId)
    if (!exchange) return log(`title #${sessionId}: no transcript yet, skipping`)
    const outcome = await generateTitle({
      worktreePath,
      userText: exchange.userText,
      assistantText: exchange.assistantText,
      queryFn: query,
    })
    // The claude call itself failed — surface why instead of folding it into
    // the decline message (that masking is how titles silently died once).
    if (outcome.kind === 'error') return log(`title #${sessionId} failed: ${outcome.reason}`)
    // Declined: not enough to title yet — leave the placeholder, retry later.
    if (outcome.kind === 'declined')
      return log(`title #${sessionId}: not enough to title yet, skipping`)
    await client.sessions.setName(sessionId, outcome.title, cfg.apiToken)
    log(`✎ titled session #${sessionId} → ${outcome.title}`)
  }

  // On (re)connect, kill any child whose session no longer exists server-side —
  // heals a session.delete that was dropped while we were disconnected. We do
  // NOT auto-start sessions: resume is explicit.
  const reconcile = async (): Promise<void> => {
    const owned = (await client.sessions.listByProject(cfg.projectId)).filter(
      s => s.workerId === cfg.workerId,
    )
    const live = new Set(owned.map(s => s.id))
    for (const [sid, entry] of children) {
      if (!live.has(sid)) {
        killChild(entry.child)
        children.delete(sid)
        log(`reconcile: stopped orphan session #${sid}`)
      }
    }
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
  es.onopen = () => void reconcile().catch(err => log(`reconcile failed: ${String(err)}`))
  es.onmessage = e => {
    try {
      const cmd = JSON.parse(e.data) as WorkerCommand
      if (cmd.cmd === 'session.start')
        void onStart(cmd.sessionId, cmd.name).catch(err => log(`start failed: ${String(err)}`))
      else if (cmd.cmd === 'session.stop') onStop(cmd.sessionId)
      else if (cmd.cmd === 'session.delete') onDelete(cmd.sessionId, cmd.worktreePath)
      else if (cmd.cmd === 'session.title')
        void onTitle(cmd.sessionId, cmd.agentSessionId, cmd.worktreePath).catch(err =>
          log(`title failed: ${String(err)}`),
        )
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
  for (const { child } of children.values()) killChild(child)
}
