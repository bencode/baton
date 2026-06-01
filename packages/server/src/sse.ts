import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

// Optional history replay: load past items then dedupe the live buffer against
// them by key (an item appended between subscribe and load shows up in both).
// Used by /sessions/:id/stream; the project/worker streams are live-only.
type Replay<T> = { load: () => Promise<T[]>; keyOf: (item: T) => string | number }
type StreamOpts<T> = { onClose?: () => void; replay?: Replay<T> }

// Shared SSE pump for a pub/sub channel. Subscribes via `subscribe(push)` first
// (so nothing is missed during an optional replay), serializes each item as a
// JSON SSE message, keepalives every 30s, and tears down (unsubscribe + optional
// onClose) on disconnect.
export const streamBus = <T>(
  c: Context,
  subscribe: (push: (item: T) => void) => () => void,
  opts: StreamOpts<T> = {},
) => {
  const signal = c.req.raw.signal
  return streamSSE(c, async stream => {
    let resolve = (): void => {}
    const pending: T[] = []
    const wake = (): void => {
      const r = resolve
      resolve = () => {}
      r()
    }
    const unsub = subscribe(item => {
      pending.push(item)
      wake()
    })
    signal.addEventListener('abort', wake)
    const keepalive = setInterval(() => {
      if (signal.aborted) return
      stream.write(': keepalive\n\n').catch(() => {})
    }, 30_000)
    try {
      const replayed = new Set<string | number>()
      if (opts.replay) {
        for (const item of await opts.replay.load()) {
          if (signal.aborted) break
          replayed.add(opts.replay.keyOf(item))
          await stream.writeSSE({ data: JSON.stringify(item) })
        }
      }
      while (!signal.aborted) {
        while (pending.length > 0 && !signal.aborted) {
          const item = pending.shift()
          if (item === undefined) continue
          if (opts.replay && replayed.has(opts.replay.keyOf(item))) continue
          await stream.writeSSE({ data: JSON.stringify(item) })
        }
        if (signal.aborted) break
        await new Promise<void>(r => {
          resolve = r
        })
      }
    } finally {
      clearInterval(keepalive)
      unsub()
      signal.removeEventListener('abort', wake)
      opts.onClose?.()
    }
  })
}
