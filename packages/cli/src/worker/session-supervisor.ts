import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Id } from '@baton/shared'
import type { ApiClient } from '../client.ts'
import { defaultWorktreeDir, slug } from '../commands/session/shared.ts'
import {
  PROJECT_CONFIG_NAME,
  saveProjectConfig,
  type WorkerConfig,
  worktreeConfig,
} from '../project-config.ts'
import { generateTitleWithCodex } from '../session/runner/title-codex.ts'
import { generateTitle } from '../session/runner/title.ts'
import { parseFirstExchangeFromEvents, readFirstExchange } from '../session/runner/transcript.ts'
import {
  createWorktree,
  ensureExcluded,
  removeWorktree,
  repoHeadBranch,
  restoreWorktree,
  syncBaseBranch,
} from '../session/worktree.ts'
import { killProcessGroup } from './proc.ts'

// Node-runnable entry to re-exec for the session child (`baton session run`).
// Dev: the tsx shim (bin/baton.mjs) that loads src/index.ts. Published bundle:
// no bin/ is shipped, so import.meta.url IS the bundle — re-exec it directly.
const binPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url))
  const devShim = join(here, '..', '..', 'bin', 'baton.mjs')
  return existsSync(devShim) ? devShim : fileURLToPath(import.meta.url)
}

export type SessionSupervisor = {
  start(sessionId: Id, name: string): Promise<void>
  stop(sessionId: Id): void
  remove(sessionId: Id, worktreePath: string | null): void
  title(sessionId: Id, agentSessionId: string, worktreePath: string): Promise<void>
  reconcile(): Promise<void>
  has(sessionId: Id): boolean
  killAll(): void
}

export type BaseBranchSync = (repo: string, branch: string) => Promise<string>

// Supervises one disposable headless child per session (`baton session run <id>`):
// materialize on first sight, (re)spawn, stop, delete, auto-title, and reconcile
// orphans on (re)connect. `hasTerminal`/`closeTerminal` are injected so the child
// never runs alongside an interactive terminal over the same agentSessionId.
export const createSessionSupervisor = (deps: {
  client: ApiClient
  cfg: WorkerConfig
  repo: string
  log: (m: string) => void
  hasTerminal: (sessionId: Id) => boolean
  closeTerminal: (sessionId: Id) => void
  syncBase?: BaseBranchSync
}): SessionSupervisor => {
  const { client, cfg, repo, log, hasTerminal, closeTerminal } = deps
  const worktreeDir = defaultWorktreeDir()
  const baseBranch = cfg.baseBranch ?? repoHeadBranch(repo)
  const syncBase = deps.syncBase ?? syncBaseBranch
  let syncInFlight: Promise<string> | null = null
  const syncedBase = (): Promise<string> => {
    if (syncInFlight) return syncInFlight
    const pending = syncBase(repo, baseBranch)
    syncInFlight = pending
    const clear = (): void => {
      if (syncInFlight === pending) syncInFlight = null
    }
    void pending.then(clear, clear)
    return pending
  }
  // Track the worktree path alongside the child so we can git-remove it on delete —
  // by then the server row is gone, so we can't re-fetch it.
  const children = new Map<Id, { child: ChildProcess; worktreePath: string }>()
  const starts = new Map<Id, { epoch: number; promise: Promise<void> }>()
  const startEpochs = new Map<Id, number>()
  const currentStartEpoch = (sessionId: Id): number => startEpochs.get(sessionId) ?? 0
  const cancelStart = (sessionId: Id): void => {
    startEpochs.set(sessionId, currentStartEpoch(sessionId) + 1)
  }

  // Spawn the session child, handing it the worker credentials via env so it can
  // authenticate session writes with the worker token.
  const spawnChild = (sessionId: Id, worktreePath: string): void => {
    if (children.has(sessionId)) return
    const child = spawn(process.execPath, [binPath(), 'session', 'run', String(sessionId)], {
      detached: true,
      stdio: 'inherit',
      env: { ...process.env, BATON_SERVER: cfg.server, BATON_WORKER_TOKEN: cfg.apiToken },
    })
    children.set(sessionId, { child, worktreePath })
    log(`spawned session #${sessionId} (${worktreePath})`)
    // The child reports itself active once its stream subscription is open (see
    // runner.ts) — so `attached` means "ready to receive", not just "spawned". We
    // only own the inactive report here (on exit), reliable even if it crashes.
    child.on('exit', code => {
      children.delete(sessionId)
      log(`session #${sessionId} child exited (code=${code ?? -1})`)
      void client.sessions.setStatus(sessionId, false, cfg.apiToken).catch(() => {})
    })
  }

  // Materialize on first sight (mint agentSessionId + git worktree, PATCH back),
  // then spawn. Idempotent: an already-materialized session (worker restart) reuses
  // the worktree and just respawns.
  const startOne = async (sessionId: Id, name: string, epoch: number): Promise<void> => {
    const wasCanceled = (): boolean => currentStartEpoch(sessionId) !== epoch
    if (wasCanceled()) return
    // An open interactive terminal owns this session's agentSessionId — never let
    // the headless child run alongside it (two claudes, one JSONL → corruption).
    // Defensive backstop: the server already rejects relay messages / resume while
    // a terminal is open. A message queued before the terminal opened drains when
    // the session next starts (the spawned child reconciles its own queue).
    if (hasTerminal(sessionId))
      return log(`session #${sessionId} has an open terminal — skipping headless start`)
    if (children.has(sessionId)) return log(`session #${sessionId} already running`)
    const session = await client.sessions.get(sessionId)
    if (wasCanceled()) return log(`session #${sessionId} start canceled before materializing`)
    let worktreePath = session.worktreePath
    if (!session.agentSessionId || !worktreePath) {
      const sessionCode = randomUUID()
      const agentSessionId = session.agentKind === 'codex' ? `pending:${sessionCode}` : sessionCode
      worktreePath = join(worktreeDir, slug(`${name}-${sessionCode.slice(0, 8)}`))
      const base = await syncedBase()
      if (wasCanceled()) return log(`session #${sessionId} start canceled during git sync`)
      createWorktree({
        repo,
        worktreePath,
        sessionCode: sessionCode.slice(0, 8),
        base,
      })
      await client.sessions.materialize(sessionId, { agentSessionId, worktreePath }, cfg.apiToken)
      if (wasCanceled()) return log(`session #${sessionId} start canceled after materializing`)
      log(`materialized session #${sessionId} → ${worktreePath}`)
    } else if (!existsSync(worktreePath)) {
      // Materialized, but the worktree dir is gone (container rebuild / cleanup) —
      // recreate at the same path, keeping the agentSessionId so it still resumes.
      await restoreWorktree(repo, worktreePath, session.agentSessionId.slice(0, 8), baseBranch)
      if (wasCanceled()) return log(`session #${sessionId} start canceled during worktree restore`)
      log(`recreated session #${sessionId} worktree (was missing) → ${worktreePath}`)
    }
    // Drop the worker's baton context into the worktree so the agent's bare `baton`
    // calls resolve server/project/worker from cwd. Overwrite every start (refreshes
    // a rotated token; no live child yet, so no race); keep it out of agent commits.
    ensureExcluded(repo, PROJECT_CONFIG_NAME)
    saveProjectConfig(join(worktreePath, PROJECT_CONFIG_NAME), worktreeConfig(cfg))
    // Re-check: the top guard ran before the awaits above (get / materialize), so a
    // terminal-open could have raced in and reserved the pty during that window —
    // don't spawn a headless child over it.
    if (hasTerminal(sessionId))
      return log(`session #${sessionId} terminal opened mid-start — skipping headless start`)
    spawnChild(sessionId, worktreePath)
  }

  const start = (sessionId: Id, name: string): Promise<void> => {
    const epoch = currentStartEpoch(sessionId)
    const existing = starts.get(sessionId)
    if (existing?.epoch === epoch) return existing.promise
    const pending = existing
      ? existing.promise.then(
          () => startOne(sessionId, name, epoch),
          () => startOne(sessionId, name, epoch),
        )
      : startOne(sessionId, name, epoch)
    starts.set(sessionId, { epoch, promise: pending })
    const clear = (): void => {
      if (starts.get(sessionId)?.promise === pending) starts.delete(sessionId)
    }
    void pending.then(clear, clear)
    return pending
  }

  // Stop: kill the child but keep the worktree (session goes inactive, resumable).
  const stop = (sessionId: Id): void => {
    cancelStart(sessionId)
    closeTerminal(sessionId) // tear down an open terminal too, if any
    const entry = children.get(sessionId)
    if (!entry) return
    killProcessGroup(entry.child)
    children.delete(sessionId)
    log(`stopped session #${sessionId}`)
  }

  // Delete: kill the child (if tracked) AND remove the worktree. The path comes
  // from our tracked entry, or the command itself when we aren't tracking a child.
  const remove = (sessionId: Id, worktreePath: string | null): void => {
    cancelStart(sessionId)
    closeTerminal(sessionId) // kill an open terminal before removing the worktree
    const entry = children.get(sessionId)
    if (entry) {
      killProcessGroup(entry.child)
      children.delete(sessionId)
    }
    const wt = entry?.worktreePath ?? worktreePath
    if (wt) removeWorktree(repo, wt)
    log(`deleted session #${sessionId} (removed worktree)`)
  }

  // Read the provider-neutral event log first so both agents share the same title
  // context. Claude's local transcript remains a fallback for legacy sessions.
  const title = async (
    sessionId: Id,
    agentSessionId: string,
    worktreePath: string,
  ): Promise<void> => {
    const session = await client.sessions.get(sessionId)
    const events = await client.sessions.listEvents(sessionId).catch(() => [])
    const exchange =
      parseFirstExchangeFromEvents(events) ??
      (session.agentKind === 'claude-code' ? readFirstExchange(agentSessionId) : null)
    if (!exchange) return log(`title #${sessionId}: no transcript yet, skipping`)
    const outcome =
      session.agentKind === 'codex'
        ? await generateTitleWithCodex({
            userText: exchange.userText,
            assistantText: exchange.assistantText,
          })
        : await generateTitle({
            worktreePath,
            userText: exchange.userText,
            assistantText: exchange.assistantText,
            queryFn: query,
          })
    if (outcome.kind === 'error') return log(`title #${sessionId} failed: ${outcome.reason}`)
    if (outcome.kind === 'declined')
      return log(`title #${sessionId}: not enough to title yet, skipping`)
    await client.sessions.setName(sessionId, outcome.title, cfg.apiToken)
    log(`✎ titled session #${sessionId} → ${outcome.title}`)
  }

  // On (re)connect, kill any child whose session no longer exists server-side —
  // heals a session.delete dropped while disconnected. We do NOT auto-start: resume
  // is explicit.
  const reconcile = async (): Promise<void> => {
    const owned = (await client.sessions.listByProject(cfg.projectId)).filter(
      s => s.workerId === cfg.workerId,
    )
    const live = new Set(owned.map(s => s.id))
    for (const [sid, entry] of children) {
      if (!live.has(sid)) {
        killProcessGroup(entry.child)
        children.delete(sid)
        log(`reconcile: stopped orphan session #${sid}`)
      }
    }
  }

  return {
    start,
    stop,
    remove,
    title,
    reconcile,
    has: sessionId => children.has(sessionId),
    killAll: () => {
      for (const { child } of children.values()) killProcessGroup(child)
    },
  }
}
