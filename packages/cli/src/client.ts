import type {
  Project,
  Requirement,
  RequirementStatus,
  ResourceRef,
  Task,
  TaskStatus,
  Workspace,
} from '@baton/shared'

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
export type ProjectInput = { workspaceId: string; name: string; description?: string }
export type RequirementInput = {
  projectId: string
  title: string
  description?: string
  resources?: ResourceRef[]
  tags?: string[]
}
export type TaskInput = {
  requirementId: string
  title: string
  spec?: string
  requires?: string[]
  dependsOn?: string[]
}

// Thin HTTP client mirroring the server routes; each method returns the parsed domain object.
export type ApiClient = {
  workspaces: {
    create(input: WorkspaceInput): Promise<Workspace>
    list(): Promise<Workspace[]>
    get(id: string): Promise<Workspace>
    remove(id: string): Promise<void>
  }
  projects: {
    create(input: ProjectInput): Promise<Project>
    listByWorkspace(workspaceId: string): Promise<Project[]>
    get(id: string): Promise<Project>
    remove(id: string): Promise<void>
  }
  requirements: {
    create(input: RequirementInput): Promise<Requirement>
    listByProject(projectId: string): Promise<Requirement[]>
    get(id: string): Promise<Requirement>
    setStatus(id: string, status: RequirementStatus): Promise<Requirement>
    remove(id: string): Promise<void>
  }
  tasks: {
    create(input: TaskInput): Promise<Task>
    listByRequirement(requirementId: string): Promise<Task[]>
    get(id: string): Promise<Task>
    setStatus(id: string, status: TaskStatus): Promise<Task>
    remove(id: string): Promise<void>
  }
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
      setStatus: (id, status) =>
        request(u(`/requirements/${id}`), { method: 'PATCH', body: { status } }),
      remove: id => request(u(`/requirements/${id}`), { method: 'DELETE' }),
    },
    tasks: {
      create: input => request(u('/tasks'), { method: 'POST', body: input }),
      listByRequirement: requirementId =>
        request(u(`/requirements/${requirementId}/tasks`), { method: 'GET' }),
      get: id => request(u(`/tasks/${id}`), { method: 'GET' }),
      setStatus: (id, status) => request(u(`/tasks/${id}`), { method: 'PATCH', body: { status } }),
      remove: id => request(u(`/tasks/${id}`), { method: 'DELETE' }),
    },
  }
}
