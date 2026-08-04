import type { Id } from './ids.ts'

// A Service is runtime presence, not durable configuration. The worker owns the
// real process; the server keeps these small snapshots only long enough to list
// and route control requests.
export type ServicePresence = {
  workerId: Id
  sessionId: Id
  name: string
  startedAt: number
  publicUrl?: string
  note?: string
}

export type ServiceSnapshot = Omit<ServicePresence, 'workerId'>

export type ServiceRunInput = {
  sessionId: Id
  name: string
  argv: string[]
  publicUrl?: string
  note?: string
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

export const SERVICE_PUBLIC_URL_MAX_LENGTH = 2048
export const SERVICE_NOTE_MAX_LENGTH = 500

export const isServicePublicUrl = (value: string): boolean => {
  if (value.length === 0 || value.length > SERVICE_PUBLIC_URL_MAX_LENGTH) return false
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export const isServiceNote = (value: string): boolean =>
  value.length > 0 && value.length <= SERVICE_NOTE_MAX_LENGTH
