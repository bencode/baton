import { type ChildProcess, spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { SessionEvent } from '@baton/shared'
import { EventSource } from 'eventsource'
import type { ApiClient, WorkerClient } from '../client.ts'
import type { SessionConfig } from './config.ts'

// Spawns `claude` CLI per turn. CLI exec (not SDK) so the user's local
// Claude auth (OAuth / API key / Bedrock / Vertex) is reused verbatim, and a
// later webterm `claude --resume <id>` opens the same conversation.
const claudeBin = (): string => process.env.BATON_CLAUDE_BIN ?? 'claude'

export type SpawnImpl = (
  command: string,
  args: ReadonlyArray<string>,
  options: Parameters<typeof spawn>[2],
) => ChildProcess

// Open-coded for tests: pass a mock EventSource ctor + a mock spawn.
export type RunnerDeps = {
  client: ApiClient
  worker: WorkerClient
  spawnImpl?: SpawnImpl
  // Default uses the eventsource package; tests pass a fake constructor.
  eventSourceImpl?: new (
    url: string,
  ) => EventSourceLike
  log?: (msg: string) => void
}

export type EventSourceLike = {
  onmessage: ((e: { data: string }) => void) | null
  onerror: (() => void) | null
  close(): void
}

const buildClaudeArgs = (claudeSessionId: string, text: string, resuming: boolean): string[] => [
  '--print',
  resuming ? '--resume' : '--session-id',
  claudeSessionId,
  '--output-format',
  'stream-json',
  '--dangerously-skip-permissions',
  text,
]

// Run exactly one turn end-to-end. POSTs turn_start, spawns claude, forwards
// each stream-json line as sdk_event, finishes with turn_complete on exit
// (regardless of exitCode — non-zero is still "the turn ended"); errors that
// prevent execution become turn_error.
export const runTurn = async (
  config: SessionConfig,
  worker: WorkerClient,
  msg: SessionEvent,
  resuming: boolean,
  spawnImpl: SpawnImpl,
): Promise<void> => {
  await worker.emitEvent('turn_start', { messageId: msg.id })
  const text = (msg.payload as { text?: unknown })?.text
  if (typeof text !== 'string' || text.length === 0) {
    await worker.emitEvent('turn_error', { message: 'user_message missing text' })
    return
  }
  // Inherit daemon env, then overlay session-specific env (e.g.
  // ANTHROPIC_BASE_URL + ANTHROPIC_AUTH_TOKEN for proxy/mirror services).
  const childEnv: NodeJS.ProcessEnv = config.env ? { ...process.env, ...config.env } : process.env

  let child: ChildProcess
  try {
    child = spawnImpl(claudeBin(), buildClaudeArgs(config.claudeSessionId, text, resuming), {
      cwd: config.worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    })
  } catch (err) {
    await worker.emitEvent('turn_error', {
      message: err instanceof Error ? err.message : String(err),
    })
    return
  }
  const stdout = child.stdout
  if (!stdout) {
    await worker.emitEvent('turn_error', { message: 'no stdout from claude' })
    return
  }
  try {
    const rl = createInterface({ input: stdout })
    for await (const line of rl) {
      const trimmed = line.trim()
      if (!trimmed) continue
      let payload: unknown
      try {
        payload = JSON.parse(trimmed)
      } catch {
        payload = { raw: trimmed }
      }
      await worker.emitEvent('sdk_event', payload)
    }
    const exitCode = await new Promise<number>(resolve =>
      child.once('exit', code => resolve(code ?? -1)),
    )
    await worker.emitEvent('turn_complete', { exitCode })
  } catch (err) {
    await worker.emitEvent('turn_error', {
      message: err instanceof Error ? err.message : String(err),
    })
  }
}

// Long-running loop: subscribe + drain. Single-flight per session via `busy`.
export const runDaemon = async (
  config: SessionConfig,
  deps: RunnerDeps,
  signal: AbortSignal,
): Promise<void> => {
  const log = deps.log ?? (m => console.log(`[${config.sessionCode}] ${m}`))
  const sp = deps.spawnImpl ?? (spawn as SpawnImpl)
  const ESCtor =
    deps.eventSourceImpl ?? (EventSource as unknown as new (u: string) => EventSourceLike)

  const history = await deps.client.sessions.listEvents(config.sessionId)
  let turns = history.filter(e => e.type === 'turn_complete').length
  const pendingQueue: SessionEvent[] = history.filter(
    e => e.type === 'user_message' && e.processedAt == null,
  )
  const seen = new Set(history.map(e => e.sequence))
  let busy = false

  const drain = async (): Promise<void> => {
    if (busy) return
    busy = true
    try {
      while (pendingQueue.length > 0 && !signal.aborted) {
        const msg = pendingQueue.shift()
        if (!msg) break
        log(`▶ msg #${msg.sequence} (${turns > 0 ? 'resume' : 'first'})`)
        await runTurn(config, deps.worker, msg, turns > 0, sp)
        turns += 1
        log(`✔ msg #${msg.sequence}`)
      }
    } finally {
      busy = false
    }
  }

  const hb = setInterval(() => {
    deps.worker.heartbeat().catch(() => {})
  }, 30_000)

  // Kick off any history-pending messages before subscribing.
  void drain()

  const streamUrl = `${config.server}/sessions/${config.sessionId}/stream`
  const es = new ESCtor(streamUrl)
  es.onmessage = e => {
    try {
      const ev = JSON.parse(e.data) as SessionEvent
      if (seen.has(ev.sequence)) return
      seen.add(ev.sequence)
      if (ev.type === 'user_message' && ev.processedAt == null) {
        pendingQueue.push(ev)
        void drain()
      }
    } catch {
      // skip malformed payloads
    }
  }
  es.onerror = () => log('sse error (eventsource will retry)')

  await new Promise<void>(resolve => {
    if (signal.aborted) return resolve()
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
  es.close()
  clearInterval(hb)
}
