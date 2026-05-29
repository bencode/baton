import type { AgentKind, Id, Session, SessionEvent, SessionMode } from '@baton/shared'
import { request } from './request.ts'

export type SessionRegisterInput = {
  projectId: Id
  workerId: Id
  mode: SessionMode
  name: string
  agentKind: AgentKind
  agentSessionId: string
  worktreePath: string
}
export type SessionRegistered = Session & { apiToken: string }

export type SessionsClient = {
  register(input: SessionRegisterInput): Promise<SessionRegistered>
  listByProject(projectId: Id): Promise<Session[]>
  get(id: Id): Promise<Session>
  findByName(projectId: Id, name: string): Promise<Session | null>
  listEvents(id: Id): Promise<SessionEvent[]>
  sendMessage(id: Id, text: string): Promise<SessionEvent>
  destroy(id: Id): Promise<void>
}

export const sessionsClient = (baseUrl: string): SessionsClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    register: input => request(u('/sessions'), { method: 'POST', body: input }),
    listByProject: projectId => request(u(`/projects/${projectId}/sessions`), { method: 'GET' }),
    get: id => request(u(`/sessions/${id}`), { method: 'GET' }),
    findByName: async (projectId, name) => {
      const all = await request<Session[]>(u(`/projects/${projectId}/sessions`), { method: 'GET' })
      // Latest (highest id) match wins when multiple share a name.
      const matches = all.filter(s => s.name === name)
      return matches.length === 0 ? null : (matches[matches.length - 1] ?? null)
    },
    listEvents: id => request(u(`/sessions/${id}/events`), { method: 'GET' }),
    sendMessage: (id, text) =>
      request(u(`/sessions/${id}/messages`), { method: 'POST', body: { text } }),
    destroy: async id => {
      await request(u(`/sessions/${id}`), { method: 'DELETE' })
    },
  }
}
