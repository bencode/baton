import type { AgentEffort, Attachment, Id, SessionEvent, SessionView } from '@baton/shared'
import { request, type Url } from './request'

// Transcript window query: `limit` = most recent n (open), `before` pages older,
// `since` = reconnect-gap backfill (events at/after a sequence). All optional.
export type EventQuery = { since?: number; before?: number; limit?: number }

// Read endpoints return the runtime view (alive/attached/busy/activeLoops) so the
// UI can surface connectivity + loop state, not just the bare Session record.
export type SessionsApi = {
  listByProject(projectId: Id): Promise<SessionView[]>
  get(id: Id): Promise<SessionView>
  create(input: { projectId: Id; workerId: Id; name?: string }): Promise<SessionView>
  // Lifecycle control: resume (re-spawn the child) / stop (kill it, keep the row).
  resume(id: Id): Promise<SessionView>
  stop(id: Id): Promise<SessionView>
  // Open / close the interactive terminal (idle sessions only; open 409s if
  // active). SessionView.terminalOpen flips true once the worker's pty WS bridges;
  // the detail view then connects its xterm over /sessions/:id/terminal/ws.
  openTerminal(id: Id): Promise<SessionView>
  closeTerminal(id: Id): Promise<SessionView>
  // Reset the conversation context (fresh agentSessionId) — keeps session/worktree/url.
  clear(id: Id): Promise<SessionView>
  // Interrupt the in-flight turn (like Esc) — keeps the session + conversation.
  abort(id: Id): Promise<SessionView>
  // Human rename — locks the name against auto-title.
  rename(id: Id, name: string): Promise<SessionView>
  // Toggle the session-wide read-only plan mode (/plan or Shift+Tab).
  setMode(id: Id, planMode: boolean): Promise<SessionView>
  // Set the session's model + effort override (/model <name> [effort]; both null
  // resets to the SDK default).
  setModel(id: Id, model: string | null, effort: AgentEffort | null): Promise<SessionView>
  // Explicit auto-title retry; completed turns normally trigger this server-side.
  autotitle(id: Id): Promise<SessionView>
  // Delete the session (worker tears down its child + worktree; row dropped).
  remove(id: Id): Promise<void>
  sendMessage(id: Id, text: string, attachments?: Attachment[]): Promise<SessionEvent>
  uploadAttachment(id: Id, file: File): Promise<Attachment>
  // Persisted transcript history (the stream then only tails live). See EventQuery.
  listEvents(id: Id, query?: EventQuery): Promise<SessionEvent[]>
}

export const sessionsApi = (u: Url): SessionsApi => ({
  listByProject: projectId => request(u(`/projects/${projectId}/sessions`), { method: 'GET' }),
  get: id => request(u(`/sessions/${id}`), { method: 'GET' }),
  create: input => request(u('/sessions'), { method: 'POST', body: input }),
  resume: id => request(u(`/sessions/${id}/resume`), { method: 'POST' }),
  stop: id => request(u(`/sessions/${id}/stop`), { method: 'POST' }),
  openTerminal: id =>
    request(u(`/sessions/${id}/terminal`), { method: 'POST', body: { action: 'open' } }),
  closeTerminal: id =>
    request(u(`/sessions/${id}/terminal`), { method: 'POST', body: { action: 'close' } }),
  clear: id => request(u(`/sessions/${id}/clear`), { method: 'POST' }),
  abort: id => request(u(`/sessions/${id}/abort`), { method: 'POST' }),
  rename: (id, name) => request(u(`/sessions/${id}/rename`), { method: 'POST', body: { name } }),
  setMode: (id, planMode) =>
    request(u(`/sessions/${id}/mode`), { method: 'POST', body: { planMode } }),
  setModel: (id, model, effort) =>
    request(u(`/sessions/${id}/model`), { method: 'POST', body: { model, effort } }),
  autotitle: id => request(u(`/sessions/${id}/autotitle`), { method: 'POST' }),
  remove: id => request(u(`/sessions/${id}`), { method: 'DELETE' }),
  sendMessage: (id, text, attachments) =>
    request(u(`/sessions/${id}/messages`), {
      method: 'POST',
      body: { text, ...(attachments && attachments.length > 0 ? { attachments } : {}) },
    }),
  // Raw-body upload (the JSON `request` helper can't carry binary): the File
  // streams as the request body, filename on the query, media type on the header.
  uploadAttachment: async (id, file) => {
    const url = u(`/sessions/${id}/attachments?filename=${encodeURIComponent(file.name || 'file')}`)
    const r = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      body: file,
      headers: { 'content-type': file.type || 'application/octet-stream' },
    })
    if (!r.ok) throw new Error(`POST ${url} → ${r.status}: ${await r.text()}`)
    return (await r.json()) as Attachment
  },
  listEvents: (id, query) => {
    const qs = new URLSearchParams()
    for (const k of ['limit', 'before', 'since'] as const)
      if (query?.[k] !== undefined) qs.set(k, String(query[k]))
    const suffix = qs.toString()
    return request(u(`/sessions/${id}/events${suffix ? `?${suffix}` : ''}`), { method: 'GET' })
  },
})
