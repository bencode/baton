import type { Context } from 'hono'
import { streamSSE } from 'hono/streaming'

// Shared SSE pump for a pub/sub channel. Subscribes via `subscribe(push)`,
// serializes each pushed item as a JSON SSE message, keepalives every 30s, and
// tears down (unsubscribe + optional onClose) when the client disconnects.
// Used by both /sessions/:id/stream and /workers/me/stream.
export const streamBus = <T>(
  c: Context,
  subscribe: (push: (item: T) => void) => () => void,
  onClose?: () => void,
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
      while (!signal.aborted) {
        while (pending.length > 0 && !signal.aborted) {
          const item = pending.shift()
          if (item !== undefined) await stream.writeSSE({ data: JSON.stringify(item) })
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
      onClose?.()
    }
  })
}
