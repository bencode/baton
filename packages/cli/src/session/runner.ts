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
  // Env vars merged on top of process.env when spawning claude. Set at
  // `session run` time so proxy / mirror configs are runtime concerns, not
  // baked into the session record.
  env?: Record<string, string>
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

// Claude requires --verbose alongside --print + --output-format=stream-json
// (otherwise it errors out before producing any events).
const buildClaudeArgs = (claudeSessionId: string, text: string, resuming: boolean): string[] => [
  '--print',
  resuming ? '--resume' : '--session-id',
  claudeSessionId,
  '--output-format',
  'stream-json',
  '--verbose',
  '--dangerously-skip-permissions',
  text,
]

// Last ~2KB of claude stderr, so a non-zero exit lands a useful tail in
// turn_error / turn_complete payloads. UI can render the tail to the operator.
const STDERR_TAIL_BYTES = 2048

type TailBuffer = { append: (chunk: string) => void; toString: () => string }
const tailBuffer = (cap = STDERR_TAIL_BYTES): TailBuffer => {
  let buf = ''
  return {
    append(chunk) {
      buf = (buf + chunk).slice(-cap)
    },
    toString() {
      return buf
    },
  }
}

const maskedEnvKeys = (env: Record<string, string> | undefined): string =>
  env ? Object.keys(env).sort().join(', ') : '(none)'

const previewText = (text: string, max = 80): string =>
  text.length > max ? `${text.slice(0, max)}…` : text

// Run exactly one turn end-to-end. Returns the child exit code so the caller
// can decide whether to advance the resume counter (only successful turns
// count — Claude's session file only exists after at least one clean run).
// POSTs turn_start, spawns claude, forwards each stream-json line as
// sdk_event, finishes with turn_complete on exit; non-zero exit also emits a
// turn_error with stderr tail so the UI surfaces the failure prominently.
// Spawn/IO failures (no subprocess to wait on) become turn_error and return
// -1.
export const runTurn = async (
  config: SessionConfig,
  worker: WorkerClient,
  msg: SessionEvent,
  resuming: boolean,
  spawnImpl: SpawnImpl,
  log: (m: string) => void = m => console.log(m),
  envOverlay?: Record<string, string>,
): Promise<number> => {
  await worker.emitEvent('turn_start', { messageId: msg.id })
  const text = (msg.payload as { text?: unknown })?.text
  if (typeof text !== 'string' || text.length === 0) {
    await worker.emitEvent('turn_error', { message: 'user_message missing text' })
    return -1
  }
  // Inherit daemon env, then overlay runtime env (e.g. ANTHROPIC_BASE_URL +
  // ANTHROPIC_AUTH_TOKEN from `session run --env`, or HTTPS_PROXY).
  const childEnv: NodeJS.ProcessEnv = envOverlay ? { ...process.env, ...envOverlay } : process.env

  const bin = claudeBin()
  const args = buildClaudeArgs(config.claudeSessionId, text, resuming)

  // Operator-facing spawn dump (no values for safety; key names only).
  log(`[spawn] ${bin} ${args.slice(0, -1).join(' ')} -- "${previewText(text)}"`)
  log(`[spawn] cwd: ${config.worktreePath}`)
  log(`[spawn] runtime env keys: ${maskedEnvKeys(envOverlay)}`)

  let child: ChildProcess
  try {
    child = spawnImpl(bin, args, {
      cwd: config.worktreePath,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[spawn] failed: ${message}`)
    await worker.emitEvent('turn_error', { message: `spawn failed: ${message}` })
    return -1
  }
  const stdout = child.stdout
  if (!stdout) {
    log('[spawn] no stdout from claude — aborting turn')
    await worker.emitEvent('turn_error', { message: 'no stdout from claude' })
    return -1
  }

  // Pipe stderr → daemon terminal + buffer last 2KB for the post-mortem.
  const tail = tailBuffer()
  if (child.stderr) {
    const errLines = createInterface({ input: child.stderr })
    void (async () => {
      for await (const line of errLines) {
        tail.append(`${line}\n`)
        log(`[claude] ${line}`)
      }
    })()
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
    log(`[exit] code=${exitCode}`)
    const stderrTail = tail.toString()
    if (exitCode !== 0) {
      // Surface the failure prominently in the UI as well as the log line.
      await worker.emitEvent('turn_error', {
        message: `claude exited with code ${exitCode}`,
        exitCode,
        stderrTail,
      })
    }
    await worker.emitEvent('turn_complete', {
      exitCode,
      ...(stderrTail ? { stderrTail } : {}),
    })
    return exitCode
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    log(`[run] ${message}`)
    await worker.emitEvent('turn_error', { message, stderrTail: tail.toString() })
    return -1
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

  log(`bin: ${claudeBin()}  cwd: ${config.worktreePath}`)
  log(`runtime env keys: ${maskedEnvKeys(deps.env)}`)

  const history = await deps.client.sessions.listEvents(config.sessionId)
  // Resume only after a turn that exited 0 — a failed first attempt (proxy
  // misconfig, network) leaves Claude's session file uncreated, so the next
  // turn must re-use --session-id, not --resume.
  let successfulTurns = history.filter(e => {
    if (e.type !== 'turn_complete') return false
    const p = e.payload as { exitCode?: unknown } | null
    return p?.exitCode === 0
  }).length
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
        const resuming = successfulTurns > 0
        log(`▶ msg #${msg.sequence} (${resuming ? 'resume' : 'first'})`)
        // runTurn returns the exit code so we can decide if this turn counts
        // toward successful turns for the next resume decision.
        const code = await runTurn(config, deps.worker, msg, resuming, sp, log, deps.env)
        if (code === 0) successfulTurns += 1
        log(`✔ msg #${msg.sequence}${code === 0 ? '' : ` (exit ${code})`}`)
      }
    } finally {
      busy = false
    }
  }

  const hb = setInterval(() => {
    deps.worker.heartbeat().catch(e => log(`heartbeat failed: ${String(e)}`))
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
