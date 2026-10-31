import { randomUUID } from 'node:crypto'
import {
  FILE_DOWNLOAD_TIMEOUT_MS,
  type FileDownloadQuery,
  type FileReply,
  type Id,
  isFileErrorCode,
} from '@baton/shared'
import type { CommandBus } from './command-bus.ts'

const DEFAULT_START_TIMEOUT_MS = 15_000

type FileFailure = Extract<FileReply, { ok: false }>

export type FileDownloadReply =
  | { ok: true; data: { size: number; body: ReadableStream<Uint8Array> } }
  | FileFailure

// Streams one file from a worker to the browser that asked for it: the server
// publishes `files.download`, the worker PUTs the bytes (or a failure) to
// /workers/me/files/downloads/:requestId, and the bytes go straight on to the
// browser with backpressure — never buffered whole, never stored. A request is
// bound to the worker it was sent to and moves waiting → transferring → gone;
// every end (done, failed, cancelled, timed out, worker gone) drops it.
export type FileDownloads = {
  request(workerId: Id, query: FileDownloadQuery, signal?: AbortSignal): Promise<FileDownloadReply>
  // Forwards the upload of a waiting request and settles once all of it has been
  // forwarded (true) or the transfer failed (throws). false: no such waiting
  // request for this worker.
  receive(
    workerId: Id,
    requestId: string,
    size: number,
    body: ReadableStream<Uint8Array>,
    signal?: AbortSignal,
  ): Promise<boolean>
  // The worker's reason a waiting request cannot be served; false as for receive.
  reject(workerId: Id, requestId: string, result: unknown): boolean
  forgetWorker(workerId: Id): void
}

type Entry = {
  workerId: Id
  // Ends the request in either state; no-op once it has ended.
  end(reason: FileFailure): void
  // Set while waiting; receive takes it to start the transfer.
  start: ((reply: FileDownloadReply) => void) | null
}

const unavailable = (message: string): FileFailure => ({ ok: false, code: 'unavailable', message })

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null

// The worker is authenticated but its report is still input.
const checkedFailure = (result: unknown): FileFailure => {
  const record = asRecord(result)
  return record?.ok === false && isFileErrorCode(record.code) && typeof record.message === 'string'
    ? { ok: false, code: record.code, message: record.message }
    : unavailable('worker sent an invalid error')
}

// Counts the bytes forwarded, failing as soon as they run past the declared size
// or end short of it.
const exactLength = (size: number): TransformStream<Uint8Array, Uint8Array> => {
  let seen = 0
  return new TransformStream({
    transform(chunk, controller) {
      seen += chunk.byteLength
      if (seen > size) throw new Error(`upload ran past its declared ${size} bytes`)
      controller.enqueue(chunk)
    },
    flush() {
      if (seen !== size) throw new Error(`upload ended at ${seen} of its declared ${size} bytes`)
    },
  })
}

const unrefTimer = (ms: number, run: () => void): ReturnType<typeof setTimeout> => {
  const timer = setTimeout(run, ms)
  if (typeof timer.unref === 'function') timer.unref()
  return timer
}

export const createFileDownloads = (
  commands: CommandBus,
  options: { startTimeoutMs?: number; transferTimeoutMs?: number } = {},
): FileDownloads => {
  const {
    startTimeoutMs = DEFAULT_START_TIMEOUT_MS,
    transferTimeoutMs = FILE_DOWNLOAD_TIMEOUT_MS,
  } = options
  const pending = new Map<string, Entry>()

  const waiting = (workerId: Id, requestId: string): Entry | null => {
    const entry = pending.get(requestId)
    return entry?.workerId === workerId && entry.start !== null ? entry : null
  }

  return {
    request(workerId, query, signal) {
      if (!commands.has(workerId))
        return Promise.resolve({ ok: false, code: 'worker_offline', message: 'worker is offline' })
      if (signal?.aborted) return Promise.resolve(unavailable('request was aborted'))
      const requestId = randomUUID()
      const reply = new Promise<FileDownloadReply>(resolve => {
        const timer = unrefTimer(startTimeoutMs, () =>
          entry.end({
            ok: false,
            code: 'worker_timeout',
            message: 'worker did not respond in time; it may need a baton CLI upgrade',
          }),
        )
        const entry: Entry = {
          workerId,
          start: reply => {
            clearTimeout(timer)
            entry.start = null
            resolve(reply)
          },
          end: reason => {
            clearTimeout(timer)
            pending.delete(requestId)
            resolve(reason)
          },
        }
        // Registered before publishing: publish delivers synchronously.
        pending.set(requestId, entry)
        signal?.addEventListener('abort', () => entry.end(unavailable('request was aborted')), {
          once: true,
        })
      })
      commands.publish(workerId, { cmd: 'files.download', requestId, query })
      return reply
    },

    async receive(workerId, requestId, size, body, signal) {
      const entry = waiting(workerId, requestId)
      const start = entry?.start
      if (!entry || !start) return false
      const transfer = new AbortController()
      const fail = (reason: FileFailure) => transfer.abort(new Error(reason.message))
      const timer = unrefTimer(transferTimeoutMs, () =>
        fail(unavailable('the download did not finish in time')),
      )
      // From here on, every end — the browser's cancel, the worker going away, the
      // upload failing, the timeout — aborts the pipe, which errors both streams.
      entry.end = fail
      signal?.addEventListener('abort', () => fail(unavailable('the upload was interrupted')), {
        once: true,
      })
      const { readable, writable } = exactLength(size)
      start({ ok: true, data: { size, body: readable } })
      try {
        await body.pipeTo(writable, { signal: transfer.signal })
        return true
      } finally {
        clearTimeout(timer)
        pending.delete(requestId)
      }
    },

    reject(workerId, requestId, result) {
      const entry = waiting(workerId, requestId)
      if (!entry) return false
      entry.end(checkedFailure(result))
      return true
    },

    forgetWorker(workerId) {
      for (const entry of pending.values())
        if (entry.workerId === workerId)
          entry.end({ ok: false, code: 'worker_offline', message: 'worker disconnected' })
    },
  }
}
