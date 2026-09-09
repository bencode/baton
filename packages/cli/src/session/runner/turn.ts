import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { type ClaimedExecution, labelAttachments } from '@baton/shared'
import { HttpError } from '../../client/request.ts'
import type { AttemptClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import { augmentPrompt, type FetchImpl, materializeAttachments } from './attachments.ts'
import { type CodexInput, startCodexEvents } from './codex.ts'
import { type QueryFn, startQuery } from './query.ts'
import { streamAgentEvents, streamClaudeSdkEvents } from './stream.ts'

export class UnsettledExecution extends Error {}

const materializeImages = async (config: SessionConfig, execution: ClaimedExecution) => {
  const images = execution.message.payload.images ?? []
  if (!images.length) return []
  const directory = join(config.worktreePath, 'attachments')
  await mkdir(directory, { recursive: true })
  await writeFile(join(directory, '.gitignore'), '*\n')
  return Promise.all(
    images.map(async (image, index) => {
      const match = /^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=\r\n]+)$/.exec(image)
      if (!match) throw new Error('unsupported pasted image')
      const path = `attachments/pasted-${execution.message.id}-${index + 1}.${match[1]}`
      await writeFile(join(config.worktreePath, path), Buffer.from(match[2] ?? '', 'base64'))
      return path
    }),
  )
}

const buildPrompt = async (
  config: SessionConfig,
  execution: ClaimedExecution,
  fetchImpl?: FetchImpl,
): Promise<{ text: string; input: CodexInput }> => {
  const { text: rawText, attachments = [] } = execution.message.payload
  const paths = attachments.length
    ? await materializeAttachments({
        worktreePath: config.worktreePath,
        serverBase: config.server,
        attachments,
        fetchImpl,
      })
    : []
  const pasted = await materializeImages(config, execution)
  const labels = [
    ...labelAttachments(attachments),
    ...pasted.map((_, index) => `pasted-image-${index + 1}`),
  ]
  const text = augmentPrompt(rawText, [...paths, ...pasted], labels)
  const imagePaths = [
    ...paths.filter((_, index) => attachments[index]?.contentType.startsWith('image/')),
    ...pasted,
  ]
  const images = imagePaths.map(path => ({
    type: 'local_image' as const,
    path: join(config.worktreePath, path),
  }))
  return { text, input: images.length ? [{ type: 'text', text }, ...images] : text }
}

export const runTurn = async (
  config: SessionConfig,
  worker: AttemptClient,
  execution: ClaimedExecution,
  resuming: boolean,
  queryFn: QueryFn,
  log: (message: string) => void,
  envOverlay?: Record<string, string>,
  fetchImpl?: FetchImpl,
  externalSignal?: AbortSignal,
): Promise<number> => {
  const abort = new AbortController()
  let timedOut = false
  let cleanupTimer: ReturnType<typeof setTimeout> | undefined
  let rejectCleanup: (error: Error) => void = () => {}
  const cleanup = new Promise<never>((_resolve, reject) => {
    rejectCleanup = reject
  })
  const interrupt = (): void => {
    if (abort.signal.aborted) return
    abort.abort()
    cleanupTimer = setTimeout(() => {
      rejectCleanup(new UnsettledExecution('SDK did not stop within 10 seconds'))
    }, 10_000)
  }
  externalSignal?.addEventListener('abort', interrupt, { once: true })
  if (externalSignal?.aborted) interrupt()
  const timeout = setTimeout(
    () => {
      timedOut = true
      void worker.heartbeat('timeout').catch(error => log(`[timeout] ${String(error)}`))
      interrupt()
    },
    Number(process.env.BATON_TURN_TIMEOUT_MS) || 30 * 60_000,
  )
  let heartbeatPending = false
  const heartbeat = setInterval(() => {
    if (heartbeatPending || abort.signal.aborted) return
    heartbeatPending = true
    void worker
      .heartbeat()
      .then(result => {
        if (result.abortRequested) interrupt()
      })
      .catch(error => {
        log(`[heartbeat] ${String(error)}`)
        if (error instanceof HttpError && error.status === 409) interrupt()
      })
      .finally(() => {
        heartbeatPending = false
      })
  }, Number(process.env.BATON_TURN_HEARTBEAT_MS) || 30_000)
  const output: AttemptClient = {
    ...worker,
    emitEvent: async (type, payload) => {
      try {
        return await worker.emitEvent(type, payload)
      } catch (error) {
        interrupt()
        throw error
      }
    },
  }
  const consume = async () => {
    if (abort.signal.aborted) throw new Error('interrupted before SDK start')
    if ((await worker.heartbeat()).abortRequested) interrupt()
    if (abort.signal.aborted) throw new Error('interrupted before SDK start')
    const built = await buildPrompt(config, execution, fetchImpl)
    if (abort.signal.aborted) throw new Error('interrupted before SDK start')
    const { planMode, model, effort } = execution.message.payload
    return config.agentKind === 'codex'
      ? streamAgentEvents(
          startCodexEvents(config, built.input, worker, {
            envOverlay,
            planMode,
            model,
            effort,
            signal: abort.signal,
            log,
          }),
          output,
        )
      : streamClaudeSdkEvents(
          startQuery(config, built.text, resuming, queryFn, abort, log, {
            envOverlay,
            planMode,
            model,
            effort,
          }),
          output,
        )
  }
  const consuming = consume().then(
    value => ({ kind: 'result' as const, value }),
    error => {
      log(`[agent] ${String(error)}`)
      return { kind: 'error' as const, error }
    },
  )
  try {
    const settled = await Promise.race([consuming, cleanup])
    const result = settled.kind === 'result' ? settled.value : null
    const input = timedOut
      ? { outcome: 'failed' as const, message: 'turn timeout' }
      : abort.signal.aborted
        ? { outcome: 'aborted' as const, message: 'interrupted' }
        : settled.kind === 'error'
          ? { outcome: 'failed' as const, message: String(settled.error) }
          : !result
            ? { outcome: 'failed' as const, message: 'agent produced no result' }
            : result.isError
              ? { outcome: 'failed' as const, message: result.resultText, subtype: result.subtype }
              : { outcome: 'completed' as const, subtype: result.subtype }
    const finished = await worker.finish(input)
    return finished.outcome === 'completed' ? 0 : 1
  } finally {
    clearTimeout(timeout)
    clearTimeout(cleanupTimer)
    clearInterval(heartbeat)
    externalSignal?.removeEventListener('abort', interrupt)
  }
}
