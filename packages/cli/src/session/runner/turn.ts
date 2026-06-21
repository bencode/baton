import { type Attachment, labelAttachments, type SessionEvent } from '@baton/shared'
import type { WorkerClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import { augmentPrompt, type FetchImpl, materializeAttachments } from './attachments.ts'
import { type QueryFn, startQuery } from './query.ts'
import { streamSdkEvents, type TurnResult } from './stream.ts'

// Hard ceiling on a single turn. A wedged claude must never hold the session
// forever (busy stays true → the session is never idle-reaped and every queued
// message blocks behind it). Past this we abort the SDK query and finalize.
// Overridable; default 30m.
const turnTimeoutMs = (): number => Number(process.env.BATON_TURN_TIMEOUT_MS) || 30 * 60_000

// How often a running turn pings the server it's still alive. A long SINGLE tool
// call (e.g. a 10-min Bash) emits no sdk_events, so without this the server's
// liveness TTL would false-reap an alive turn. 30s = the daemon's heartbeat
// cadence; TTL (90s) tolerates a couple of missed pings. Overridable.
const heartbeatMs = (): number => Number(process.env.BATON_TURN_HEARTBEAT_MS) || 30_000

const TIMEOUT = Symbol('turn-timeout')
const ABORTED = Symbol('turn-aborted')

// Emit turn_error (on a failed/empty result) + turn_complete for a finished
// turn. Returns 0 on success, 1 on a result-level error.
const finalizeTurn = async (
  result: TurnResult | null,
  worker: WorkerClient,
  log: (m: string) => void,
): Promise<number> => {
  if (!result) {
    log('[exit] stream ended with no result')
    await worker.emitEvent('turn_error', { message: 'claude produced no result' })
    await worker.emitEvent('turn_complete', {})
    return -1
  }
  log(`[exit] subtype=${result.subtype} isError=${result.isError}`)
  if (result.isError) {
    await worker.emitEvent('turn_error', {
      message: result.resultText || `claude result: ${result.subtype}`,
      subtype: result.subtype,
    })
  }
  await worker.emitEvent('turn_complete', { subtype: result.subtype })
  return result.isError ? 1 : 0
}

// Pull attachments into the worktree (if any) and return the prompt text,
// possibly augmented to point at the downloaded files. Throws on download
// failure so the caller can surface a turn_error.
const buildPrompt = async (
  config: SessionConfig,
  rawText: string,
  attachments: Attachment[],
  log: (m: string) => void,
  fetchImpl?: FetchImpl,
): Promise<string> => {
  if (attachments.length === 0) return rawText
  const relPaths = await materializeAttachments({
    worktreePath: config.worktreePath,
    serverBase: config.server,
    attachments,
    fetchImpl,
  })
  log(`[attach] downloaded ${relPaths.length} file(s) → ${config.worktreePath}/attachments`)
  return augmentPrompt(rawText, relPaths, labelAttachments(attachments))
}

// Run exactly one turn end-to-end. POSTs turn_start, drives claude through the
// SDK, forwards each message as sdk_event, finishes with turn_complete (plus a
// turn_error on failure). A watchdog aborts a turn that outlives the ceiling so
// it can never wedge the session. Returns 0 on success, -1/1 otherwise.
export const runTurn = async (
  config: SessionConfig,
  worker: WorkerClient,
  msg: SessionEvent,
  resuming: boolean,
  queryFn: QueryFn,
  log: (m: string) => void = m => console.log(m),
  envOverlay?: Record<string, string>,
  fetchImpl?: FetchImpl,
  externalSignal?: AbortSignal,
): Promise<number> => {
  await worker.emitEvent('turn_start', { messageId: msg.id })
  const payload = msg.payload as {
    text?: unknown
    attachments?: Attachment[]
    planMode?: unknown
    model?: unknown
  }
  const rawText = typeof payload?.text === 'string' ? payload.text : ''
  const attachments = Array.isArray(payload?.attachments) ? payload.attachments : []
  const planMode = payload?.planMode === true
  const model = typeof payload?.model === 'string' ? payload.model : undefined
  if (rawText.length === 0 && attachments.length === 0) {
    await worker.emitEvent('turn_error', { message: 'user_message missing text and attachments' })
    return -1
  }

  let text: string
  try {
    text = await buildPrompt(config, rawText, attachments, log, fetchImpl)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await worker.emitEvent('turn_error', { message: `attachment download failed: ${message}` })
    return -1
  }

  const abort = new AbortController()
  const ceiling = turnTimeoutMs()
  let timer: ReturnType<typeof setTimeout> | undefined
  let heartbeat: ReturnType<typeof setInterval> | undefined
  const timeout = new Promise<typeof TIMEOUT>(resolve => {
    timer = setTimeout(() => resolve(TIMEOUT), ceiling)
  })
  // User-initiated interrupt (web /abort, like Esc): the runner passes a signal
  // it aborts on a session `interrupt` event. Resolving the race lets us abort
  // the SDK query and finalize cleanly instead of waiting the turn out.
  const interrupted = new Promise<typeof ABORTED>(resolve => {
    if (externalSignal?.aborted) resolve(ABORTED)
    else externalSignal?.addEventListener('abort', () => resolve(ABORTED), { once: true })
  })

  try {
    // Prove the turn is alive while it runs — covers a long single tool call that
    // streams no sdk_events. Best-effort: a dropped ping is fine (the TTL tolerates
    // misses), so log rather than swallow but never let it fail the turn.
    heartbeat = setInterval(() => {
      void worker.emitEvent('turn_heartbeat', {}).catch(e => log(`[heartbeat] ${String(e)}`))
    }, heartbeatMs())
    const messages = startQuery(config, text, resuming, queryFn, abort, log, {
      envOverlay,
      planMode,
      model,
    })
    const consume = streamSdkEvents(messages, worker)
    void consume.catch(() => {}) // abort below may make it reject; handled via race
    const outcome = await Promise.race([consume, timeout, interrupted])
    if (outcome === ABORTED) {
      log('[abort] interrupted by user')
      abort.abort()
      await worker.emitEvent('turn_error', { message: 'interrupted by user' })
      await worker.emitEvent('turn_complete', {})
      return -1
    }
    if (outcome === TIMEOUT) {
      log(`[watchdog] turn exceeded ${ceiling}ms — aborting claude`)
      abort.abort()
      await worker.emitEvent('turn_error', {
        message: `turn exceeded ${ceiling}ms — claude aborted`,
      })
      await worker.emitEvent('turn_complete', {})
      return -1
    }
    return await finalizeTurn(outcome, worker, log)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[run] ${message}`)
    await worker.emitEvent('turn_error', { message })
    await worker.emitEvent('turn_complete', {})
    return -1
  } finally {
    clearTimeout(timer)
    clearInterval(heartbeat)
  }
}
