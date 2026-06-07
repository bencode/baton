import type {
  Attachment,
  Code,
  Id,
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Session,
  SessionEvent,
  SessionView,
  Task,
  TaskComment,
  TaskStatus,
  User,
  WorkerView,
  Workspace,
} from '@baton/shared'

// Dev: '/api' is proxied to the server (prefix stripped). Prod base decided when server hosts the UI.
export const API_BASE = '/api'

// Browser-resolvable src for an attachment's bytes (img preview / download link).
export const attachmentSrc = (a: Attachment): string => `${API_BASE}${a.url}`

type ReqInit = { method: string; body?: unknown }

const request = async <T>(url: string, init: ReqInit): Promise<T> => {
  const res = await fetch(url, {
    method: init.method,
    // Same-origin (the web is served alongside /api) → the session cookie rides
    // along; this is what authenticates every back-office call once auth is on.
    credentials: 'same-origin',
    ...(init.body !== undefined
      ? { body: JSON.stringify(init.body), headers: { 'content-type': 'application/json' } }
      : {}),
  })
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export type WorkspaceInput = { name: string }
export type ProjectInput = { workspaceId: Id; name: string; description?: string }
export type RequirementInput = {
  projectId: Id
  title: string
  description?: string
  body?: string
  resources?: ResourceRef[]
}
export type TaskInput = {
  requirementId: Id
  title: string
  body?: string
  dependsOn?: Id[]
}

// web's own HTTP client (browser fetch), mirroring the server routes; types from @baton/shared.
export type Api = {
  health(): Promise<{ ok: boolean }>
  // Cookie-session auth. login/shareLogin mint the cookie (the browser stores it);
  // me drives the auth gate (401 → show login). shareLogin is the standalone
  // page's auto-login — a valid share token logs in as the seeded user.
  auth: {
    login(username: string, password: string): Promise<{ user: User }>
    logout(): Promise<void>
    // Resolves when access is allowed (authRequired:false when no users seeded, or
    // a valid cookie); throws 401 when auth is on and the caller isn't logged in.
    me(): Promise<{ authRequired: boolean; user: User | null }>
    shareLogin(token: string): Promise<{ session: Session }>
  }
  workspaces: {
    create(input: WorkspaceInput): Promise<Workspace>
    list(): Promise<Workspace[]>
    get(id: Id): Promise<Workspace>
    update(id: Id, patch: { name?: string }): Promise<Workspace>
    remove(id: Id): Promise<void>
  }
  projects: {
    create(input: ProjectInput): Promise<Project>
    listByWorkspace(workspaceId: Id): Promise<Project[]>
    get(id: Id): Promise<Project>
    update(id: Id, patch: { name?: string; description?: string }): Promise<Project>
    remove(id: Id): Promise<void>
  }
  requirements: {
    create(input: RequirementInput): Promise<Requirement>
    listByProject(projectId: Id): Promise<Requirement[]>
    get(id: Id): Promise<Requirement>
    getByCode(projectId: Id, code: Code): Promise<Requirement>
    setStatus(id: Id, status: RequirementStatus): Promise<Requirement>
    remove(id: Id): Promise<void>
  }
  tasks: {
    create(input: TaskInput): Promise<Task>
    listByRequirement(requirementId: Id): Promise<Task[]>
    get(id: Id): Promise<Task>
    getByCode(projectId: Id, code: Code): Promise<Task>
    setStatus(id: Id, status: TaskStatus): Promise<Task>
    remove(id: Id): Promise<void>
    listComments(id: Id): Promise<TaskComment[]>
    addComment(id: Id, body: string, workerId?: Id): Promise<TaskComment>
  }
  sessions: {
    // Read endpoints return the runtime view (alive/attached/busy) so the UI can
    // surface worker/daemon connectivity, not just the bare Session record.
    listByProject(projectId: Id): Promise<SessionView[]>
    get(id: Id): Promise<SessionView>
    create(input: { projectId: Id; workerId: Id; name?: string }): Promise<SessionView>
    // Lifecycle control: resume (re-spawn the child) / stop (kill it, keep the row).
    resume(id: Id): Promise<SessionView>
    stop(id: Id): Promise<SessionView>
    // Reset the conversation context (fresh agentSessionId) — keeps the session,
    // worktree, url. The /clear composer command calls this.
    clear(id: Id): Promise<SessionView>
    // Interrupt the in-flight turn (the /abort composer command, like Esc) —
    // keeps the session + conversation.
    abort(id: Id): Promise<SessionView>
    // Human rename — locks the name against auto-title.
    rename(id: Id, name: string): Promise<SessionView>
    // Ask the worker to auto-title this session (no-op unless still unnamed).
    autotitle(id: Id): Promise<SessionView>
    // Delete the session (worker tears down its child + worktree; row dropped).
    remove(id: Id): Promise<void>
    sendMessage(
      id: Id,
      text: string,
      attachments?: Attachment[],
      planMode?: boolean,
    ): Promise<SessionEvent>
    uploadAttachment(id: Id, file: File): Promise<Attachment>
    // Persisted transcript history, fetched once on open (the stream then only
    // tails live) — avoids replaying the whole log over SSE. `since` bounds the
    // result to events at/after a sequence, so a reconnect can pull just the gap.
    listEvents(id: Id, since?: number): Promise<SessionEvent[]>
  }
  workers: {
    listByProject(projectId: Id): Promise<WorkerView[]>
    get(id: Id): Promise<WorkerView>
  }
  // SSE URL for a session's transcript (EventSource sends the cookie same-origin).
  sessionStreamUrl(id: Id): string
}

export const createApi = (base: string = API_BASE): Api => {
  const u = (p: string): string => `${base}${p}`
  const fetchItemByCode = async (projectId: Id, code: Code, expectKind: 'requirement' | 'task') => {
    const r = await request<{ kind: string; item: unknown }>(
      u(`/projects/${projectId}/items/${encodeURIComponent(code)}`),
      { method: 'GET' },
    )
    if (r.kind !== expectKind)
      throw new Error(`expected ${expectKind} but got ${r.kind} for ${code}`)
    return r.item
  }
  return {
    health: () => request(u('/health'), { method: 'GET' }),
    auth: {
      login: (username, password) =>
        request(u('/auth/login'), { method: 'POST', body: { username, password } }),
      logout: () => request(u('/auth/logout'), { method: 'POST' }),
      me: () => request(u('/auth/me'), { method: 'GET' }),
      shareLogin: token => request(u(`/auth/share/${token}`), { method: 'POST' }),
    },
    workspaces: {
      create: input => request(u('/workspaces'), { method: 'POST', body: input }),
      list: () => request(u('/workspaces'), { method: 'GET' }),
      get: id => request(u(`/workspaces/${id}`), { method: 'GET' }),
      update: (id, patch) => request(u(`/workspaces/${id}`), { method: 'PATCH', body: patch }),
      remove: id => request(u(`/workspaces/${id}`), { method: 'DELETE' }),
    },
    projects: {
      create: input => request(u('/projects'), { method: 'POST', body: input }),
      listByWorkspace: workspaceId =>
        request(u(`/workspaces/${workspaceId}/projects`), { method: 'GET' }),
      get: id => request(u(`/projects/${id}`), { method: 'GET' }),
      update: (id, patch) => request(u(`/projects/${id}`), { method: 'PATCH', body: patch }),
      remove: id => request(u(`/projects/${id}`), { method: 'DELETE' }),
    },
    requirements: {
      create: input => request(u('/requirements'), { method: 'POST', body: input }),
      listByProject: projectId =>
        request(u(`/projects/${projectId}/requirements`), { method: 'GET' }),
      get: id => request(u(`/requirements/${id}`), { method: 'GET' }),
      getByCode: async (projectId, code) =>
        (await fetchItemByCode(projectId, code, 'requirement')) as Requirement,
      setStatus: (id, status) =>
        request(u(`/requirements/${id}`), { method: 'PATCH', body: { status } }),
      remove: id => request(u(`/requirements/${id}`), { method: 'DELETE' }),
    },
    tasks: {
      create: input => request(u('/tasks'), { method: 'POST', body: input }),
      listByRequirement: requirementId =>
        request(u(`/requirements/${requirementId}/tasks`), { method: 'GET' }),
      get: id => request(u(`/tasks/${id}`), { method: 'GET' }),
      getByCode: async (projectId, code) =>
        (await fetchItemByCode(projectId, code, 'task')) as Task,
      setStatus: (id, status) => request(u(`/tasks/${id}`), { method: 'PATCH', body: { status } }),
      remove: id => request(u(`/tasks/${id}`), { method: 'DELETE' }),
      listComments: id => request(u(`/tasks/${id}/comments`), { method: 'GET' }),
      addComment: (id, body, workerId) =>
        request(u(`/tasks/${id}/comments`), { method: 'POST', body: { body, workerId } }),
    },
    sessions: {
      listByProject: projectId => request(u(`/projects/${projectId}/sessions`), { method: 'GET' }),
      get: id => request(u(`/sessions/${id}`), { method: 'GET' }),
      create: input => request(u('/sessions'), { method: 'POST', body: input }),
      resume: id => request(u(`/sessions/${id}/resume`), { method: 'POST' }),
      stop: id => request(u(`/sessions/${id}/stop`), { method: 'POST' }),
      clear: id => request(u(`/sessions/${id}/clear`), { method: 'POST' }),
      abort: id => request(u(`/sessions/${id}/abort`), { method: 'POST' }),
      rename: (id, name) =>
        request(u(`/sessions/${id}/rename`), { method: 'POST', body: { name } }),
      autotitle: id => request(u(`/sessions/${id}/autotitle`), { method: 'POST' }),
      remove: id => request(u(`/sessions/${id}`), { method: 'DELETE' }),
      sendMessage: (id, text, attachments, planMode) =>
        request(u(`/sessions/${id}/messages`), {
          method: 'POST',
          body: {
            text,
            ...(attachments && attachments.length > 0 ? { attachments } : {}),
            ...(planMode ? { planMode: true } : {}),
          },
        }),
      // Raw-body upload (the JSON `request` helper can't carry binary): the File
      // streams as the request body, filename on the query, media type on the header.
      uploadAttachment: async (id, file) => {
        const url = u(
          `/sessions/${id}/attachments?filename=${encodeURIComponent(file.name || 'file')}`,
        )
        const r = await fetch(url, {
          method: 'POST',
          credentials: 'same-origin',
          body: file,
          headers: { 'content-type': file.type || 'application/octet-stream' },
        })
        if (!r.ok) throw new Error(`POST ${url} → ${r.status}: ${await r.text()}`)
        return (await r.json()) as Attachment
      },
      listEvents: (id, since) =>
        request(u(`/sessions/${id}/events${since ? `?since=${since}` : ''}`), { method: 'GET' }),
    },
    workers: {
      listByProject: projectId => request(u(`/projects/${projectId}/workers`), { method: 'GET' }),
      get: id => request(u(`/workers/${id}`), { method: 'GET' }),
    },
    // Live-only — history comes from sessions.listEvents (one fetch), so the
    // stream never replays the whole transcript.
    sessionStreamUrl: id => u(`/sessions/${id}/stream?live=1`),
  }
}
