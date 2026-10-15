import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { Id } from '@baton/shared'
import type { ApiClient } from '../client.ts'
import { type WorkerConfig, workerEnv } from '../project-config.ts'
import { generateTitle } from '../session/runner/title.ts'
import { generateTitleWithCodex } from '../session/runner/title-codex.ts'
import { parseFirstExchangeFromEvents, readFirstExchange } from '../session/runner/transcript.ts'
import { killProcessGroup } from './proc.ts'
import { sessionRuntimeDir } from './runtime-paths.ts'
import {
  type RunnerRecord,
  readRunnerRecord,
  stopRecordedRunner,
  writeRunnerRecord,
} from './session-process.ts'

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
  stop(sessionId: Id): Promise<void>
  remove(sessionId: Id): Promise<void>
  title(sessionId: Id, agentSessionId: string, cwd: string): Promise<void>
  reconcile(sessionId?: Id): Promise<void>
  has(sessionId: Id): boolean
  killAll(): Promise<void>
}

// Supervises one disposable headless child per session (`baton session run <id>`):
// materialize on first sight, (re)spawn, stop, delete, auto-title, and reconcile
// orphans on (re)connect. `hasTerminal`/`closeTerminal` are injected so the child
// never runs alongside an interactive terminal over the same agentSessionId.
export const createSessionSupervisor = (deps: {
  client: ApiClient
  cfg: WorkerConfig
  cwd: string
  log: (m: string) => void
  hasTerminal: (sessionId: Id) => boolean
  closeTerminal: (sessionId: Id) => void
}): SessionSupervisor => {
  const { client, cfg, cwd, log, hasTerminal, closeTerminal } = deps
  const children = new Map<Id, { child: ChildProcess }>()
  const lifecycle = new Map<Id, Promise<void>>()
  const enqueue = (id: Id, action: () => Promise<void>): Promise<void> => {
    const previous = lifecycle.get(id)
    const pending = previous
      ? previous.catch(error => log(`previous lifecycle #${id}: ${String(error)}`)).then(action)
      : action()
    lifecycle.set(id, pending)
    const clear = (): void => {
      if (lifecycle.get(id) === pending) lifecycle.delete(id)
    }
    void pending.then(clear, clear)
    return pending
  }
  const starts = new Map<Id, { epoch: number; promise: Promise<void> }>()
  const startEpochs = new Map<Id, number>()
  const currentStartEpoch = (sessionId: Id): number => startEpochs.get(sessionId) ?? 0
  const cancelStart = (sessionId: Id): void => {
    startEpochs.set(sessionId, currentStartEpoch(sessionId) + 1)
  }

  // Spawn the session child, handing it the worker credentials via env so it can
  // authenticate session writes with the worker token.
  const stopRecord = async (sessionId: Id, token?: string): Promise<void> => {
    const record = await readRunnerRecord(sessionRuntimeDir(cfg, sessionId))
    if (!record) {
      if (token) throw new Error('missing record for an unfinished execution')
      return
    }
    if (token && token !== record.runnerToken)
      throw new Error('runner identity does not match the attempt')
    await stopRecordedRunner(record, { server: cfg.server, workerId: cfg.workerId, sessionId })
  }

  const spawnChild = async (
    sessionId: Id,
    cwd: string,
    wasCanceled: () => boolean,
  ): Promise<void> => {
    if (children.has(sessionId)) return
    await stopRecord(sessionId)
    const runnerToken = randomUUID()
    const child = spawn(
      process.execPath,
      [binPath(), 'session', 'run', String(sessionId), '--runner-token', runnerToken],
      {
        detached: true,
        stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
        cwd,
        env: workerEnv(cfg),
      },
    )
    const entry = { child }
    children.set(sessionId, entry)
    let readyTimer: ReturnType<typeof setTimeout>
    const ready = new Promise<void>((resolve, reject) => {
      child.on('message', message => {
        if (
          typeof message === 'object' &&
          message !== null &&
          'type' in message &&
          message.type === 'ready'
        )
          resolve()
      })
      child.once('error', reject)
      child.once('exit', () => reject(new Error('session child exited before ready')))
      readyTimer = setTimeout(() => reject(new Error('session child readiness timeout')), 30_000)
    })
    const readiness = ready.finally(() => clearTimeout(readyTimer))
    // Observe rejection before the record write finishes.
    void readiness.catch(error => log(`[runner-ready] ${String(error)}`))
    child.on('exit', code => {
      if (children.get(sessionId) !== entry) return
      children.delete(sessionId)
      log(`session #${sessionId} exited (${code})`)
      void client.sessions
        .setStatus(sessionId, false, cfg.apiToken)
        .catch(error => log(`inactive report failed: ${String(error)}`))
    })
    child.on('message', message => {
      if (children.get(sessionId) !== entry) return
      if (
        typeof message === 'object' &&
        message !== null &&
        'type' in message &&
        message.type === 'execution-stuck'
      )
        void stop(sessionId).catch(error => log(`stuck execution cleanup failed: ${String(error)}`))
    })
    try {
      await new Promise<void>((resolve, reject) => {
        child.once('spawn', resolve)
        child.once('error', reject)
      })
      if (!child.pid) throw new Error('session child has no PID')
      const record: RunnerRecord = {
        server: cfg.server,
        workerId: cfg.workerId,
        sessionId,
        runnerToken,
        pid: child.pid,
        pgid: child.pid,
      }
      await writeRunnerRecord(sessionRuntimeDir(cfg, sessionId), record)
      await readiness
      if (wasCanceled()) return
      await new Promise<void>((resolve, reject) =>
        child.send({ type: 'execute' }, error => (error ? reject(error) : resolve())),
      )
    } catch (error) {
      killProcessGroup(child)
      throw error
    }
  }

  // Materialize the Agent conversation in the Worker directory, then spawn.
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
    const execution = await client.sessions.execution(sessionId)
    if (
      execution.paused ||
      execution.contextResetRequested ||
      execution.attempt?.status === 'running' ||
      execution.attempt?.status === 'stopping'
    )
      return
    if (wasCanceled()) return log(`session #${sessionId} start canceled before materializing`)
    const directory = session.cwd ?? cwd
    if (!(await stat(directory)).isDirectory()) throw new Error(`not a directory: ${directory}`)
    if (wasCanceled()) return
    if (!session.agentSessionId || !session.cwd) {
      const id = randomUUID()
      const agentSessionId = session.agentKind === 'codex' ? `pending:${id}` : id
      await client.sessions.materialize(sessionId, { agentSessionId, cwd: directory }, cfg.apiToken)
      log(`materialized session #${sessionId} (${name}) → ${directory}`)
    }
    await mkdir(sessionRuntimeDir(cfg, sessionId), { recursive: true, mode: 0o700 })
    // Re-check: the top guard ran before the awaits above (get / materialize), so a
    // terminal-open could have raced in and reserved the pty during that window —
    // don't spawn a headless child over it.
    if (hasTerminal(sessionId))
      return log(`session #${sessionId} terminal opened mid-start — skipping headless start`)
    if (wasCanceled()) return
    await spawnChild(sessionId, directory, wasCanceled)
  }

  const start = (sessionId: Id, name: string): Promise<void> => {
    const epoch = currentStartEpoch(sessionId)
    const existing = starts.get(sessionId)
    if (existing?.epoch === epoch) return existing.promise
    const pending = enqueue(sessionId, () => startOne(sessionId, name, epoch))
    starts.set(sessionId, { epoch, promise: pending })
    const clear = (): void => {
      if (starts.get(sessionId)?.promise === pending) starts.delete(sessionId)
    }
    void pending.then(clear, clear)
    return pending
  }

  // Stop: kill the child but keep the working directory (session goes inactive, resumable).
  const stop = (sessionId: Id): Promise<void> => {
    cancelStart(sessionId)
    return enqueue(sessionId, async () => {
      const entry = children.get(sessionId)
      await stopRecord(sessionId)
      if (entry && children.get(sessionId) === entry) children.delete(sessionId)
    })
  }

  const remove = (sessionId: Id): Promise<void> => {
    cancelStart(sessionId)
    closeTerminal(sessionId)
    return enqueue(sessionId, async () => {
      const entry = children.get(sessionId)
      await stopRecord(sessionId)
      await rm(sessionRuntimeDir(cfg, sessionId), { recursive: true, force: true })
      if (children.get(sessionId) === entry) children.delete(sessionId)
    })
  }

  // Read the provider-neutral event log first so both agents share the same title
  // context. Claude's local transcript remains a fallback for legacy sessions.
  const title = async (sessionId: Id, agentSessionId: string, cwd: string): Promise<void> => {
    const session = await client.sessions.get(sessionId)
    const events = await client.sessions.listEvents(sessionId)
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
            cwd,
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

  // Re-read durable state inside the lifecycle queue, so a stale reconcile
  // cannot kill a replacement child started by a simultaneous command.
  const reconcile = async (sessionId?: Id): Promise<void> => {
    const sessions =
      sessionId === undefined
        ? (await client.sessions.listByProject(cfg.projectId)).filter(
            s => s.workerId === cfg.workerId,
          )
        : [await client.sessions.get(sessionId)]
    for (const candidate of sessions)
      await enqueue(candidate.id, async () => {
        const session = await client.sessions.get(candidate.id)
        let execution = await client.sessions.execution(session.id)
        if (execution.attempt?.status === 'stopping') {
          if (!session.cwd) throw new Error('unfinished execution without cwd')
          if (
            children.has(session.id) &&
            Date.now() - (execution.attempt.stopRequestedAt ?? 0) < 10_000
          )
            return
          await stopRecord(session.id, execution.attempt.runnerToken)
          children.delete(session.id)
          await client.sessions.stopped(
            session.id,
            execution.attempt.id,
            execution.attempt.runnerToken,
          )
          execution = await client.sessions.execution(session.id)
        }
        if (execution.paused) {
          if (session.cwd) await stopRecord(session.id)
          return
        }
        if (execution.attempt?.status === 'running') {
          if (!children.has(session.id) && session.cwd)
            await stopRecord(session.id, execution.attempt.runnerToken)
          return
        }
        if (execution.pendingCount || execution.turn?.status === 'recovering')
          await startOne(session.id, session.name, currentStartEpoch(session.id))
      })
    if (sessionId === undefined) {
      const live = new Set(sessions.map(s => s.id))
      for (const [id, entry] of children) {
        if (!live.has(id))
          await enqueue(id, async () => {
            await stopRecord(id)
            if (children.get(id) === entry) children.delete(id)
          })
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
    killAll: async () => {
      for (const id of new Set([...children.keys(), ...starts.keys()])) await stop(id)
    },
  }
}
