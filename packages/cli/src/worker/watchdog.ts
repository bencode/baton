// Worker self-watchdog predicates (pure, so they unit-test without timers).
//
// The daemon has two independent liveness signals — the heartbeat POST and the
// command-stream SSE — and each can wedge while the process stays alive after a
// server flap. We judge each by a TIME WINDOW against its last-OK timestamp, not
// a consecutive-failure count: a flapping server (502 → 200 → 502) would keep
// resetting a counter and stall the watchdog forever.

// True once `okAt` is older than `thresholdMs` (the signal has been silent too long).
export const stale = (okAt: number, now: number, thresholdMs: number): boolean =>
  now - okAt > thresholdMs

// The command stream is wedged only when it is BOTH not currently open AND has
// been unhealthy past the threshold. An open stream — even an idle one with no
// commands — is healthy, and a brief reconnect is tolerated; only a stream stuck
// retrying (readyState ≠ OPEN) for the whole window counts as wedged.
export const streamWedged = (
  isOpen: boolean,
  okAt: number,
  now: number,
  thresholdMs: number,
): boolean => !isOpen && stale(okAt, now, thresholdMs)
