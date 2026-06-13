// A single message on a relay channel — a lightweight Claude↔Claude back-channel
// between two agent sessions on different machines. Independent of
// project/worker/session: a channel is just an id + capability token.
export type RelayMessage = {
  // Per-channel monotonic sequence; doubles as the reconnect replay cursor.
  seq: number
  // Free-form sender label (the participant's chosen name).
  from: string
  text: string
  // Server-stamped epoch milliseconds.
  ts: number
}
