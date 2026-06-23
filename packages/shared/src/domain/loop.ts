import type { Id } from './ids.ts'

// A Loop is a recurring scheduled wake-up bound to one Session: every
// `intervalSec` seconds the server sends `message` to the session, which
// auto-resumes the worker and runs a turn. Recurring only — `enabled` pauses it
// without deleting. Cascades away with its Session.
//
// Timestamps are epoch-ms on the wire (mapped from Prisma DateTime). `lastStatus`
// records how the most recent beat went: 'ok' when delivered, 'skipped_offline'
// when the worker wasn't connected (the beat is skipped, not queued).
export type LoopStatus = 'ok' | 'skipped_offline'

export type Loop = {
  id: Id
  sessionId: Id
  name?: string
  message: string
  intervalSec: number
  enabled: boolean
  nextRunAt: number
  lastRunAt?: number
  lastStatus?: LoopStatus
  createdAt: number
  updatedAt: number
}
