import type {
  AgentKind,
  Attachment,
  Id,
  Session,
  SessionEvent,
  SessionMode,
  SessionView,
} from '@baton/shared'
import { request } from './request.ts'

// Create a session (collaboration metadata only). agentSessionId/worktreePath
// are filled later by the owning worker via `materialize`. Returns the session
// view (no token — the worker authenticates with its own apiToken).
export type SessionCreateInput = {
  projectId: Id
  workerId: Id
  name: string
  mode?: SessionMode
  agentKind?: AgentKind
}

export type SessionsClient = {
  create(input: SessionCreateInput): Promise<SessionView>
  materialize(
    id: Id,
    input: { agentSessionId: string; worktreePath: string },
    workerToken: string,
  ): Promise<Session>
  // Worker reports its child up/down (worker-bearer). Drives `attached`.
  setStatus(id: Id, active: boolean, workerToken: string): Promise<Session>
  resume(id: Id): Promise<SessionView>
  stop(id: Id): Promise<SessionView>
  listByProject(projectId: Id): Promise<SessionView[]>
  get(id: Id): Promise<SessionView>
  findByName(projectId: Id, name: string): Promise<Session | null>
  sendMessage(id: Id, text: string, attachments?: Attachment[]): Promise<SessionEvent>
  uploadAttachment(
    id: Id,
    input: { filename: string; contentType: string; body: Blob },
  ): Promise<Attachment>
  destroy(id: Id): Promise<void>
}

export const sessionsClient = (baseUrl: string): SessionsClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    create: input => request(u('/sessions'), { method: 'POST', body: input }),
    materialize: (id, input, workerToken) =>
      request(u(`/sessions/${id}`), {
        method: 'PATCH',
        body: input,
        headers: { authorization: `Bearer ${workerToken}` },
      }),
    setStatus: (id, active, workerToken) =>
      request(u(`/sessions/${id}/status`), {
        method: 'POST',
        body: { active },
        headers: { authorization: `Bearer ${workerToken}` },
      }),
    resume: id => request(u(`/sessions/${id}/resume`), { method: 'POST' }),
    stop: id => request(u(`/sessions/${id}/stop`), { method: 'POST' }),
    listByProject: projectId => request(u(`/projects/${projectId}/sessions`), { method: 'GET' }),
    get: id => request(u(`/sessions/${id}`), { method: 'GET' }),
    findByName: async (projectId, name) => {
      const all = await request<Session[]>(u(`/projects/${projectId}/sessions`), { method: 'GET' })
      // Latest (highest id) match wins when multiple share a name.
      const matches = all.filter(s => s.name === name)
      return matches.length === 0 ? null : (matches[matches.length - 1] ?? null)
    },
    sendMessage: (id, text, attachments) =>
      request(u(`/sessions/${id}/messages`), {
        method: 'POST',
        body: attachments && attachments.length > 0 ? { text, attachments } : { text },
      }),
    // Raw-body upload: the file streams as the request body (no multipart), so
    // a Blob backed by a file on disk uploads without buffering. filename rides
    // a query param; content-type carries the media type.
    uploadAttachment: async (id, input) => {
      const url = u(`/sessions/${id}/attachments?filename=${encodeURIComponent(input.filename)}`)
      const res = await fetch(url, {
        method: 'POST',
        body: input.body,
        headers: { 'content-type': input.contentType },
      })
      if (!res.ok) throw new Error(`POST ${url} → ${res.status}: ${await res.text()}`)
      return (await res.json()) as Attachment
    },
    destroy: async id => {
      await request(u(`/sessions/${id}`), { method: 'DELETE' })
    },
  }
}
