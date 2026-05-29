import type {
  Code,
  Id,
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Session,
  SessionEvent,
  Task,
  TaskStatus,
  WorkerView,
  Workspace,
} from '@baton/shared'

// Dev: '/api' is proxied to the server (prefix stripped). Prod base decided when server hosts the UI.
export const API_BASE = '/api'

type ReqInit = { method: string; body?: unknown }

const request = async <T>(url: string, init: ReqInit): Promise<T> => {
  const res = await fetch(url, {
    method: init.method,
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
  resources?: ResourceRef[]
  tags?: string[]
}
export type TaskInput = {
  requirementId: Id
  title: string
  spec?: string
  dependsOn?: Id[]
}

// web's own HTTP client (browser fetch), mirroring the server routes; types from @baton/shared.
export type Api = {
  health(): Promise<{ ok: boolean }>
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
    listByProject(projectId: Id): Promise<Session[]>
    get(id: Id): Promise<Session>
    listEvents(id: Id): Promise<SessionEvent[]>
    sendMessage(id: Id, text: string): Promise<SessionEvent>
  }
  workers: {
    listByProject(projectId: Id): Promise<WorkerView[]>
    get(id: Id): Promise<WorkerView>
  }
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
    },
    sessions: {
      listByProject: projectId => request(u(`/projects/${projectId}/sessions`), { method: 'GET' }),
      get: id => request(u(`/sessions/${id}`), { method: 'GET' }),
      listEvents: id => request(u(`/sessions/${id}/events`), { method: 'GET' }),
      sendMessage: (id, text) =>
        request(u(`/sessions/${id}/messages`), { method: 'POST', body: { text } }),
    },
    workers: {
      listByProject: projectId => request(u(`/projects/${projectId}/workers`), { method: 'GET' }),
      get: id => request(u(`/workers/${id}`), { method: 'GET' }),
    },
  }
}
