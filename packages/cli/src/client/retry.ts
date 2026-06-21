export type RetryOpts = { tries?: number; baseMs?: number }

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

// Bounded retry-with-backoff for the few load-bearing requests that MUST land —
// the turn boundary events (turn_start/turn_complete/turn_error). A transient
// server flap (e.g. a 502 burst) during finalize used to lose the turn_complete,
// stranding the turn as "thinking" forever. This rides the flap out. BOUNDED on
// purpose: an unbounded retry would re-introduce the very wedge it prevents (the
// turn would never return). On final failure it rethrows — the caller already
// logs and finalizes, and the server-side TTL sweep still backstops a total loss.
export const withRetry = async <T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> => {
  const tries = Math.max(1, opts.tries ?? 4)
  const baseMs = opts.baseMs ?? 300
  let lastErr: unknown
  for (let i = 0; i < tries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i === tries - 1) break
      const backoff = baseMs * 2 ** i // 300 / 600 / 1200 … rides a typical flap
      await sleep(backoff + Math.random() * baseMs) // jitter so retries don't sync
    }
  }
  throw lastErr
}
