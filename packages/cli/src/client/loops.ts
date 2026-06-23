import type { Id, Loop } from '@baton/shared'
import { request } from './request.ts'

export type LoopCreateInput = {
  name?: string
  message: string
  intervalSec: number
  enabled?: boolean
}
export type LoopUpdateInput = Partial<{
  name: string | null
  message: string
  intervalSec: number
  enabled: boolean
}>

export type LoopsClient = {
  create(sessionId: Id, input: LoopCreateInput): Promise<Loop>
  listBySession(sessionId: Id): Promise<Loop[]>
  get(id: Id): Promise<Loop>
  update(id: Id, input: LoopUpdateInput): Promise<Loop>
  remove(id: Id): Promise<void>
}

export const loopsClient = (baseUrl: string): LoopsClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    create: (sessionId, input) =>
      request(u(`/sessions/${sessionId}/loops`), { method: 'POST', body: input }),
    listBySession: sessionId => request(u(`/sessions/${sessionId}/loops`), { method: 'GET' }),
    get: id => request(u(`/loops/${id}`), { method: 'GET' }),
    update: (id, input) => request(u(`/loops/${id}`), { method: 'PATCH', body: input }),
    remove: async id => {
      await request(u(`/loops/${id}`), { method: 'DELETE' })
    },
  }
}
