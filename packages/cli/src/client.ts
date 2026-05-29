import type {
  Code,
  Id,
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Session,
  SessionEvent,
  SessionEventType,
  SessionMode,
  Task,
  TaskStatus,
  Workspace,
} from '@baton/shared'

type ReqInit = { method: string; body?: unknown; headers?: Record<string, string> }

const request = async <T>(url: string, init: ReqInit): Promise<T> => {
  const baseHeaders: Record<string, string> =
    init.body !== undefined ? { 'content-type': 'application/json' } : {}
  const res = await fetch(url, {
    method: init.method,
    headers: { ...baseHeaders, ...(init.headers ?? {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
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
  resources?: ResourceRef[]
  tags?: string[]
}
export type TaskInput = {
  requirementId: Id
  title: string
  spec?: string
  dependsOn?: Id[]
}
export type SessionRegisterInput = {
  projectId: Id
  mode: SessionMode
  name: string
  claudeSessionId?: string
  worktreePath?: string
  machineId?: string
  hostname?: string
  workerName?: string
}
export type SessionRegistered = Session & { apiToken: string }

// Public HTTP client (UI / CLI / observability tools).
export type ApiClient = {
  workspaces: {
    create(input: WorkspaceInput): Promise<Workspace>
    list(): Promise<Workspace[]>
    get(id: Id): Promise<Workspace>
    remove(id: Id): Promise<void>
  }
  projects: {
    create(input: ProjectInput): Promise<Project>
    listByWorkspace(workspaceId: Id): Promise<Project[]>
    get(id: Id): Promise<Project>
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
  }
  sessions: {
    register(input: SessionRegisterInput): Promise<SessionRegistered>
    listByProject(projectId: Id): Promise<Session[]>
    get(id: Id): Promise<Session>
    findByName(projectId: Id, name: string): Promise<Session | null>
    listEvents(id: Id): Promise<SessionEvent[]>
    sendMessage(id: Id, text: string): Promise<SessionEvent>
  }
}

// Worker-private client: bearer-authed write endpoints. Mostly used by the
// long-running `baton session run` daemon (commit 2).
export type WorkerClient = {
  heartbeat(): Promise<Session>
  close(): Promise<void>
  emitEvent(type: SessionEventType, payload: unknown): Promise<SessionEvent>
}

const fetchItemByCode = async <T>(
  baseUrl: string,
  projectId: Id,
  code: Code,
  expectKind: string,
): Promise<T> => {
  const r = await request<{ kind: string; item: unknown }>(
    `${baseUrl}/projects/${projectId}/items/${encodeURIComponent(code)}`,
    { method: 'GET' },
  )
  if (r.kind !== expectKind) throw new Error(`expected ${expectKind} but got ${r.kind} for ${code}`)
  return r.item as T
}

export const createClient = (baseUrl: string): ApiClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  return {
    workspaces: {
      create: input => request(u('/workspaces'), { method: 'POST', body: input }),
      list: () => request(u('/workspaces'), { method: 'GET' }),
      get: id => request(u(`/workspaces/${id}`), { method: 'GET' }),
      remove: id => request(u(`/workspaces/${id}`), { method: 'DELETE' }),
    },
    projects: {
      create: input => request(u('/projects'), { method: 'POST', body: input }),
      listByWorkspace: workspaceId =>
        request(u(`/workspaces/${workspaceId}/projects`), { method: 'GET' }),
      get: id => request(u(`/projects/${id}`), { method: 'GET' }),
      remove: id => request(u(`/projects/${id}`), { method: 'DELETE' }),
    },
    requirements: {
      create: input => request(u('/requirements'), { method: 'POST', body: input }),
      listByProject: projectId =>
        request(u(`/projects/${projectId}/requirements`), { method: 'GET' }),
      get: id => request(u(`/requirements/${id}`), { method: 'GET' }),
      getByCode: (projectId, code) =>
        fetchItemByCode<Requirement>(baseUrl, projectId, code, 'requirement'),
      setStatus: (id, status) =>
        request(u(`/requirements/${id}`), { method: 'PATCH', body: { status } }),
      remove: id => request(u(`/requirements/${id}`), { method: 'DELETE' }),
    },
    tasks: {
      create: input => request(u('/tasks'), { method: 'POST', body: input }),
      listByRequirement: requirementId =>
        request(u(`/requirements/${requirementId}/tasks`), { method: 'GET' }),
      get: id => request(u(`/tasks/${id}`), { method: 'GET' }),
      getByCode: (projectId, code) => fetchItemByCode<Task>(baseUrl, projectId, code, 'task'),
      setStatus: (id, status) => request(u(`/tasks/${id}`), { method: 'PATCH', body: { status } }),
      remove: id => request(u(`/tasks/${id}`), { method: 'DELETE' }),
    },
    sessions: {
      register: input => request(u('/sessions'), { method: 'POST', body: input }),
      listByProject: projectId => request(u(`/projects/${projectId}/sessions`), { method: 'GET' }),
      get: id => request(u(`/sessions/${id}`), { method: 'GET' }),
      findByName: async (projectId, name) => {
        const all = await request<Session[]>(u(`/projects/${projectId}/sessions`), {
          method: 'GET',
        })
        // Latest (highest id) match wins when there are stale duplicates.
        const matches = all.filter(s => s.name === name && !s.closedAt)
        return matches.length === 0 ? null : (matches[matches.length - 1] ?? null)
      },
      listEvents: id => request(u(`/sessions/${id}/events`), { method: 'GET' }),
      sendMessage: (id, text) =>
        request(u(`/sessions/${id}/messages`), { method: 'POST', body: { text } }),
    },
  }
}

export const createWorkerClient = (baseUrl: string, apiToken: string): WorkerClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  const auth = { authorization: `Bearer ${apiToken}` }
  return {
    heartbeat: () =>
      request(u('/sessions/me/heartbeat'), { method: 'POST', body: {}, headers: auth }),
    close: () => request(u('/sessions/me/close'), { method: 'POST', headers: auth }),
    emitEvent: (type, payload) =>
      request(u('/sessions/me/events'), {
        method: 'POST',
        body: { type, payload },
        headers: auth,
      }),
  }
}
