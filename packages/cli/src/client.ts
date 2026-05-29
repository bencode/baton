import type { SessionEvent, SessionEventType } from '@baton/shared'
import { projectClient, type ProjectClient } from './client/projects.ts'
import { requirementClient, type RequirementClient } from './client/requirements.ts'
import { request } from './client/request.ts'
import { sessionsClient, type SessionsClient } from './client/sessions.ts'
import { taskClient, type TaskClient } from './client/tasks.ts'
import { workersClient, type WorkersClient } from './client/workers.ts'
import { workspaceClient, type WorkspaceClient } from './client/workspaces.ts'

// Re-export per-resource input / output types so the rest of the cli
// (commands, tests) can keep importing from '../client.ts'.
export type { ProjectInput } from './client/projects.ts'
export type { RequirementInput } from './client/requirements.ts'
export type {
  SessionRegisterInput,
  SessionRegistered,
} from './client/sessions.ts'
export type { TaskInput } from './client/tasks.ts'
export type {
  WorkerRegisterInput,
  WorkerRegisterOutcome,
  WorkerRegisterOutput,
} from './client/workers.ts'
export type { WorkspaceInput } from './client/workspaces.ts'

// Public HTTP client (UI / CLI / observability tools).
export type ApiClient = {
  workspaces: WorkspaceClient
  projects: ProjectClient
  requirements: RequirementClient
  tasks: TaskClient
  sessions: SessionsClient
  workers: WorkersClient
}

// Session-private client: bearer-authed write endpoints used by the
// long-running `baton session run` daemon to emit events / close.
export type WorkerClient = {
  close(): Promise<void>
  emitEvent(type: SessionEventType, payload: unknown): Promise<SessionEvent>
}

export const createClient = (baseUrl: string): ApiClient => ({
  workspaces: workspaceClient(baseUrl),
  projects: projectClient(baseUrl),
  requirements: requirementClient(baseUrl),
  tasks: taskClient(baseUrl),
  sessions: sessionsClient(baseUrl),
  workers: workersClient(baseUrl),
})

export const createWorkerClient = (baseUrl: string, apiToken: string): WorkerClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  const auth = { authorization: `Bearer ${apiToken}` }
  return {
    close: () => request(u('/sessions/me/close'), { method: 'POST', headers: auth }),
    emitEvent: (type, payload) =>
      request(u('/sessions/me/events'), {
        method: 'POST',
        body: { type, payload },
        headers: auth,
      }),
  }
}
