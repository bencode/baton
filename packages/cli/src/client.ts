import type {
  Assignment,
  AssignmentEvent,
  AssignmentStatus,
  Code,
  Id,
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Session,
  SessionMode,
  SessionStatus,
  Task,
  TaskStatus,
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
  requires?: string[]
  dependsOn?: Id[]
}
export type SessionRegisterInput = {
  projectId: Id
  mode: SessionMode
  name: string
  capabilities?: string[]
}
export type SessionRegistered = Session & { apiToken: string }
export type ClaimResult = { assignment: Assignment; task: Task }

// Thin HTTP client mirroring the server routes; each method returns the parsed domain object.
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
  }
  assignments: {
    listByProject(
      projectId: Id,
      filter?: { status?: AssignmentStatus[]; sessionId?: Id },
    ): Promise<Assignment[]>
    get(id: Id): Promise<Assignment>
    events(id: Id): Promise<AssignmentEvent[]>
  }
}

// Worker-private client: same routes but with Authorization: Bearer <token>.
export type WorkerClient = {
  heartbeat(status?: SessionStatus): Promise<Session>
  claim(): Promise<ClaimResult | null>
  close(): Promise<void>
  appendEvent(assignmentId: Id, sequence: number, payload: unknown): Promise<AssignmentEvent>
  complete(assignmentId: Id, status: 'done' | 'failed', result?: string): Promise<Assignment>
  abandon(assignmentId: Id, reason?: string): Promise<Assignment>
}

import type { Workspace } from '@baton/shared'

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
  const buildQuery = (filter?: { status?: AssignmentStatus[]; sessionId?: Id }): string => {
    if (!filter) return ''
    const params: string[] = []
    if (filter.status?.length) params.push(`status=${filter.status.join(',')}`)
    if (filter.sessionId) params.push(`sessionId=${filter.sessionId}`)
    return params.length ? `?${params.join('&')}` : ''
  }
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
    },
    assignments: {
      listByProject: (projectId, filter) =>
        request(u(`/projects/${projectId}/assignments${buildQuery(filter)}`), { method: 'GET' }),
      get: id => request(u(`/assignments/${id}`), { method: 'GET' }),
      events: id => request(u(`/assignments/${id}/events`), { method: 'GET' }),
    },
  }
}

export const createWorkerClient = (baseUrl: string, apiToken: string): WorkerClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  const auth = { authorization: `Bearer ${apiToken}` }
  return {
    heartbeat: status =>
      request(u('/sessions/me/heartbeat'), {
        method: 'POST',
        body: status ? { status } : {},
        headers: auth,
      }),
    claim: async () => {
      const res = await fetch(u('/sessions/me/claim'), { method: 'POST', headers: auth })
      if (res.status === 204) return null
      if (!res.ok) throw new Error(`POST /sessions/me/claim → ${res.status}: ${await res.text()}`)
      return (await res.json()) as ClaimResult
    },
    close: () => request(u('/sessions/me/close'), { method: 'POST', headers: auth }),
    appendEvent: (assignmentId, sequence, payload) =>
      request(u(`/assignments/${assignmentId}/events`), {
        method: 'POST',
        body: { sequence, payload },
        headers: auth,
      }),
    complete: (assignmentId, status, result) =>
      request(u(`/assignments/${assignmentId}/complete`), {
        method: 'POST',
        body: { status, result },
        headers: auth,
      }),
    abandon: (assignmentId, reason) =>
      request(u(`/assignments/${assignmentId}/abandon`), {
        method: 'POST',
        body: reason ? { reason } : {},
        headers: auth,
      }),
  }
}
