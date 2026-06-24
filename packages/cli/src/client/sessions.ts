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
  // Worker auto-title (worker-bearer): server applies it only if unlocked.
  setName(id: Id, name: string, workerToken: string): Promise<Session>
  resume(id: Id): Promise<SessionView>
  stop(id: Id): Promise<SessionView>
  // Open / close the interactive ttyd terminal for a session (UI/CLI). open 409s
  // if the session is active; the spawned URL arrives async on SessionView.
  openTerminal(id: Id): Promise<SessionView>
  closeTerminal(id: Id): Promise<SessionView>
  // Worker reports the spawned ttyd URL (or null on teardown) — worker-bearer.
  reportTerminalUrl(id: Id, url: string | null, workerToken: string): Promise<Session>
  // Reset the claude conversation (fresh agentSessionId) but keep the session +
  // worktree; the running child is restarted to pick up the new context.
  clear(id: Id): Promise<SessionView>
  // Interrupt the in-flight turn (like Esc) — keeps the session + conversation.
  abort(id: Id): Promise<SessionView>
  rename(id: Id, name: string): Promise<SessionView>
  listByProject(projectId: Id): Promise<SessionView[]>
  get(id: Id): Promise<SessionView>
  findByName(projectId: Id, name: string): Promise<Session | null>
  sendMessage(
    id: Id,
    text: string,
    attachments?: Attachment[],
    planMode?: boolean,
  ): Promise<SessionEvent>
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
    setName: (id, name, workerToken) =>
      request(u(`/sessions/${id}`), {
        method: 'PATCH',
        body: { name },
        headers: { authorization: `Bearer ${workerToken}` },
      }),
    resume: id => request(u(`/sessions/${id}/resume`), { method: 'POST' }),
    stop: id => request(u(`/sessions/${id}/stop`), { method: 'POST' }),
    openTerminal: id =>
      request(u(`/sessions/${id}/terminal`), { method: 'POST', body: { action: 'open' } }),
    closeTerminal: id =>
      request(u(`/sessions/${id}/terminal`), { method: 'POST', body: { action: 'close' } }),
    reportTerminalUrl: (id, url, workerToken) =>
      request(u(`/sessions/${id}/terminal-url`), {
        method: 'POST',
        body: { url },
        headers: { authorization: `Bearer ${workerToken}` },
      }),
    clear: id => request(u(`/sessions/${id}/clear`), { method: 'POST' }),
    abort: id => request(u(`/sessions/${id}/abort`), { method: 'POST' }),
    rename: (id, name) => request(u(`/sessions/${id}/rename`), { method: 'POST', body: { name } }),
    listByProject: projectId => request(u(`/projects/${projectId}/sessions`), { method: 'GET' }),
    get: id => request(u(`/sessions/${id}`), { method: 'GET' }),
    findByName: async (projectId, name) => {
      const all = await request<Session[]>(u(`/projects/${projectId}/sessions`), { method: 'GET' })
      // Latest (highest id) match wins when multiple share a name.
      const matches = all.filter(s => s.name === name)
      return matches.length === 0 ? null : (matches[matches.length - 1] ?? null)
    },
    sendMessage: (id, text, attachments, planMode) =>
      request(u(`/sessions/${id}/messages`), {
        method: 'POST',
        body: {
          text,
          ...(attachments && attachments.length > 0 ? { attachments } : {}),
          ...(planMode ? { planMode: true } : {}),
        },
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
