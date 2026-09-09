import { randomUUID } from 'node:crypto'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { ClaimResult, SessionEvent } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { WorkerClient } from '../client.ts'
import type { SessionConfig } from '../project-config.ts'
import type { FetchImpl } from './runner/attachments.ts'
import type { QueryFn } from './runner/query.ts'
import { findTranscriptPath } from './runner/transcript.ts'
import { runTurn } from './runner/turn.ts'

export type { QueryFn } from './runner/query.ts'
export { runTurn } from './runner/turn.ts'

export type EventSourceLike = {
  onmessage: ((e: { data: string }) => void) | null
  onerror: (() => void) | null
  onopen: (() => void) | null
  close(): void
}
export type RunnerDeps = {
  worker: WorkerClient
  runnerToken: string
  env?: Record<string, string>
  queryFn?: QueryFn
  eventSourceImpl?: new (url: string) => EventSourceLike
  fetchImpl?: FetchImpl
  log?: (msg: string) => void
}
export const isAgentConversationResumable = (
  config: SessionConfig,
  transcriptPath: (agentSessionId: string) => string | null = findTranscriptPath,
): boolean =>
  config.agentKind === 'codex'
    ? !config.agentSessionId.startsWith('pending:')
    : transcriptPath(config.agentSessionId) !== null

export const shouldReap = (
  lastActivity: number,
  now: number,
  busy: boolean,
  queueLen: number,
  idleMs: number,
): boolean => !busy && queueLen === 0 && now - lastActivity >= idleMs

export const runDaemon = async (
  config: SessionConfig,
  deps: RunnerDeps,
  signal: AbortSignal,
): Promise<void> => {
  const log = deps.log ?? console.log
  const Constructor =
    deps.eventSourceImpl ?? (EventSource as unknown as new (url: string) => EventSourceLike)
  const stream = new Constructor(`${config.server}/sessions/${config.sessionId}/stream?live=1`)
  let current: { attemptId: number; abort: AbortController } | undefined
  let draining: Promise<void> | undefined
  let stranded = false
  let closed = false
  let claimId = randomUUID()
  let lastActivity = Date.now()
  let stop: () => void = () => {}
  const stopped = new Promise<void>(resolve => {
    stop = resolve
  })
  const drain = async (): Promise<void> => {
    if (draining || closed || stranded) return
    const run = async () => {
      while (!closed && !stranded && !signal.aborted) {
        let claimed: ClaimResult
        try {
          claimed = await deps.worker.claim({ claimId, runnerToken: deps.runnerToken })
        } catch (error) {
          log(`[claim] ${String(error)}`)
          return
        }
        if (claimed.kind === 'idle') return
        if (claimed.kind === 'stopping') {
          stranded = true
          return
        }
        claimId = randomUUID()
        if (claimed.kind === 'settled') continue
        Object.assign(config, claimed.config)
        current = { attemptId: claimed.attempt.id, abort: new AbortController() }
        if (closed || signal.aborted) current.abort.abort()
        lastActivity = Date.now()
        try {
          await runTurn(
            config,
            deps.worker.forAttempt(claimed.attempt.id, deps.runnerToken),
            claimed,
            isAgentConversationResumable(config),
            deps.queryFn ?? query,
            log,
            deps.env,
            deps.fetchImpl,
            current.abort.signal,
          )
        } catch (error) {
          // A model invocation has already happened. Never replay it locally after
          // an uncertain finish; the durable attempt and supervisor own recovery.
          stranded = true
          log(`[execution] ${String(error)}`)
          if (process.connected)
            process.send?.({ type: 'execution-stuck', attemptId: claimed.attempt.id })
        } finally {
          current = undefined
          lastActivity = Date.now()
        }
      }
    }
    draining = run()
    try {
      await draining
    } finally {
      draining = undefined
    }
  }
  const wake = (): void => {
    void drain().catch(error => log(`[drain] ${String(error)}`))
  }
  stream.onopen = () => {
    void deps.worker.setActive(true).catch(error => log(`[status] ${String(error)}`))
    wake()
  }
  stream.onerror = () => log('[stream] disconnected; retrying')
  stream.onmessage = ({ data }) => {
    let event: SessionEvent
    try {
      event = JSON.parse(data) as SessionEvent
    } catch (error) {
      log(`[stream] malformed event: ${String(error)}`)
      return
    }
    if (event.type === 'queue_changed') {
      lastActivity = Date.now()
      wake()
    }
    if (event.type === 'system') {
      const payload = event.payload as { action?: string; attemptId?: number } | null
      if (payload?.action === 'interrupt' && payload.attemptId === current?.attemptId)
        current?.abort.abort()
    }
  }
  const onAbort = (): void => {
    closed = true
    current?.abort.abort()
    stop()
  }
  signal.addEventListener('abort', onAbort, { once: true })
  if (signal.aborted) onAbort()
  const timer = setInterval(() => {
    if (
      shouldReap(
        lastActivity,
        Date.now(),
        !!draining || stranded,
        0,
        Number(process.env.BATON_SESSION_IDLE_MS) || 30 * 60_000,
      )
    ) {
      closed = true
      stop()
      return
    }
    wake()
  }, 10_000)
  try {
    await stopped
    await draining
  } finally {
    closed = true
    clearInterval(timer)
    stream.close()
    signal.removeEventListener('abort', onAbort)
  }
}
