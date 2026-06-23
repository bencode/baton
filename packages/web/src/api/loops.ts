import type { Id, Loop } from '@baton/shared'
import { request, type Url } from './request'

export type LoopInput = {
  name?: string
  message: string
  intervalSec: number
  enabled?: boolean
}
export type LoopPatch = {
  name?: string | null
  message?: string
  intervalSec?: number
  enabled?: boolean
}

// Recurring scheduled wake-ups bound to a session (see @baton/shared Loop).
export type LoopsApi = {
  listBySession(sessionId: Id): Promise<Loop[]>
  create(sessionId: Id, input: LoopInput): Promise<Loop>
  update(id: Id, patch: LoopPatch): Promise<Loop>
  remove(id: Id): Promise<void>
}

export const loopsApi = (u: Url): LoopsApi => ({
  listBySession: sessionId => request(u(`/sessions/${sessionId}/loops`), { method: 'GET' }),
  create: (sessionId, input) =>
    request(u(`/sessions/${sessionId}/loops`), { method: 'POST', body: input }),
  update: (id, patch) => request(u(`/loops/${id}`), { method: 'PATCH', body: patch }),
  remove: id => request(u(`/loops/${id}`), { method: 'DELETE' }),
})
