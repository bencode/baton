import { randomUUID } from 'node:crypto'
import {
  FILE_IMAGE_MAX_BYTES,
  FILE_TEXT_MAX_BYTES,
  type FileQuery,
  type FileReply,
  type Id,
  IMAGE_MEDIA_TYPES,
  isFileErrorCode,
} from '@baton/shared'
import type { CommandBus } from './command-bus.ts'

const DEFAULT_TIMEOUT_MS = 15_000

type Pending = {
  workerId: Id
  op: FileQuery['op']
  resolve: (reply: FileReply) => void
  timer: ReturnType<typeof setTimeout>
}

// Request/reply over the worker command stream for read-only file queries: the
// server publishes `files.query`, the worker answers with PUT /workers/me/files/results.
// In-memory and live-only — nothing is cached. Unlike service commands, a reply
// is accepted only from the worker the request was sent to.
export type FileRequests = {
  query<Op extends FileQuery['op']>(
    workerId: Id,
    query: Extract<FileQuery, { op: Op }>,
    signal?: AbortSignal,
  ): Promise<FileReply<Op>>
  settle(workerId: Id, result: unknown): boolean
  forgetWorker(workerId: Id): void
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

type FileFailure = Extract<FileReply, { ok: false }>

const unavailable = (message: string): FileFailure => ({ ok: false, code: 'unavailable', message })

// The worker is authenticated but its payload is still input: anything malformed
// or over the text limit becomes `unavailable`.
const checkedReply = (op: FileQuery['op'], result: Record<string, unknown>): FileReply => {
  if (result.ok === false)
    return isFileErrorCode(result.code) && typeof result.message === 'string'
      ? { ok: false, code: result.code, message: result.message }
      : unavailable('worker sent an invalid error')
  const data = asRecord(result.data)
  if (result.ok !== true || data === null) return unavailable('worker sent an invalid reply')
  if (
    op === 'view' &&
    data.kind === 'text' &&
    (typeof data.content !== 'string' || Buffer.byteLength(data.content) > FILE_TEXT_MAX_BYTES)
  )
    return unavailable('worker sent text over the size limit')
  if (
    op === 'raw' &&
    !(
      Object.values(IMAGE_MEDIA_TYPES).includes(String(data.mediaType)) &&
      typeof data.base64 === 'string' &&
      Buffer.byteLength(data.base64, 'base64') <= FILE_IMAGE_MAX_BYTES
    )
  )
    return unavailable('worker sent an invalid image')
  return { ok: true, data } as FileReply
}

export const createFileRequests = (
  commands: CommandBus,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): FileRequests => {
  const pending = new Map<string, Pending>()

  const finish = (requestId: string, reply: FileReply): void => {
    const entry = pending.get(requestId)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.delete(requestId)
    entry.resolve(reply)
  }

  return {
    query<Op extends FileQuery['op']>(
      workerId: Id,
      query: Extract<FileQuery, { op: Op }>,
      signal?: AbortSignal,
    ): Promise<FileReply<Op>> {
      if (!commands.has(workerId))
        return Promise.resolve({ ok: false, code: 'worker_offline', message: 'worker is offline' })
      if (signal?.aborted) return Promise.resolve(unavailable('request was aborted'))
      const requestId = randomUUID()
      const reply = new Promise<FileReply>(resolve => {
        const timer = setTimeout(
          () =>
            finish(requestId, {
              ok: false,
              code: 'worker_timeout',
              message: 'worker did not respond in time; it may need a baton CLI upgrade',
            }),
          timeoutMs,
        )
        if (typeof timer.unref === 'function') timer.unref()
        // Registered before publishing: publish delivers synchronously.
        pending.set(requestId, { workerId, op: query.op, resolve, timer })
      })
      signal?.addEventListener(
        'abort',
        () => finish(requestId, unavailable('request was aborted')),
        { once: true },
      )
      commands.publish(workerId, { cmd: 'files.query', requestId, query })
      return reply as Promise<FileReply<Op>>
    },
    settle(workerId, result) {
      const record = asRecord(result)
      const requestId = typeof record?.requestId === 'string' ? record.requestId : null
      const entry = requestId === null ? undefined : pending.get(requestId)
      if (!record || requestId === null || !entry || entry.workerId !== workerId) return false
      finish(requestId, checkedReply(entry.op, record))
      return true
    },
    forgetWorker(workerId) {
      for (const [requestId, entry] of pending)
        if (entry.workerId === workerId)
          finish(requestId, { ok: false, code: 'worker_offline', message: 'worker disconnected' })
    },
  }
}
