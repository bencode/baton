import { stale, streamWedged } from './watchdog.ts'

// The worker has TWO independent liveness signals, each its own self-watchdog: the
// heartbeat POST proves the machine is reachable; the command stream (SSE) is how
// commands actually arrive. After a server flap either can wedge while the process
// stays alive — so the OS supervisor never restarts it and the worker goes silently
// offline. We judge each by a TIME WINDOW against its last-OK timestamp (not a
// consecutive-failure count, so a flapping server can't keep resetting it) and trip
// once either is stale. The per-ping timeout makes a *hung* server count as silence.
const HEARTBEAT_MS = 30_000
const HEARTBEAT_TIMEOUT_MS = 15_000
const HEARTBEAT_DEAD_MS = 150_000 // ~5 missed beats with no real recovery
const STREAM_STALE_MS = 90_000 // stuck not-OPEN this long ⇒ wedged

export type Liveness = {
  markStreamOk(): void
  start(): void
  stop(): void
}

export const createLiveness = (deps: {
  heartbeat: () => Promise<unknown>
  log: (m: string) => void
  isStreamOpen: () => boolean
  reportRuntime?: () => Promise<void>
  onTrip: (reason: string) => void
}): Liveness => {
  const { heartbeat, log, isStreamOpen, reportRuntime, onTrip } = deps
  let heartbeatOkAt = Date.now()
  let streamOkAt = Date.now()
  let timer: ReturnType<typeof setInterval> | null = null

  const ping = async (): Promise<void> => {
    if (reportRuntime)
      void reportRuntime().catch(error => log(`service report failed: ${String(error)}`))
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        heartbeat(),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('heartbeat timeout')), HEARTBEAT_TIMEOUT_MS)
        }),
      ])
      heartbeatOkAt = Date.now()
    } catch (e) {
      log(`heartbeat failed: ${String(e)}`)
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }

  const tick = (): void => {
    const now = Date.now()
    if (stale(heartbeatOkAt, now, HEARTBEAT_DEAD_MS))
      onTrip(`heartbeat down ~${HEARTBEAT_DEAD_MS / 1000}s`)
    else if (streamWedged(isStreamOpen(), streamOkAt, now, STREAM_STALE_MS))
      onTrip(`command stream wedged ~${STREAM_STALE_MS / 1000}s`)
  }

  return {
    markStreamOk: () => {
      streamOkAt = Date.now()
    },
    start: () => {
      void ping()
      timer = setInterval(() => {
        void ping()
        tick()
      }, HEARTBEAT_MS)
    },
    stop: () => {
      if (timer) clearInterval(timer)
    },
  }
}
