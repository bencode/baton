import type { Id } from './ids.ts'

// A Service is runtime presence, not durable configuration. The worker owns the
// real process; the server keeps these small snapshots only long enough to list
// and route control requests.
export type ServicePresence = {
  workerId: Id
  sessionId: Id
  name: string
  startedAt: number
}

export type ServiceSnapshot = Omit<ServicePresence, 'workerId'>

export type ServiceRunInput = {
  sessionId: Id
  name: string
  argv: string[]
}

export type ServiceActionResult =
  | {
      requestId: string
      ok: true
      service?: ServicePresence
      logPath?: string
    }
  | {
      requestId: string
      ok: false
      error: string
      status: 400 | 404 | 409 | 500 | 504
    }

export type ServiceReport = {
  services: ServiceSnapshot[]
  result?: ServiceActionResult
}

export const isServiceName = (value: string): boolean =>
  /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(value)
