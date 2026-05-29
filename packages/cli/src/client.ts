import type { SessionEvent, SessionEventType } from '@baton/shared'
import { type ProjectClient, projectClient } from './client/projects.ts'
import { request } from './client/request.ts'
import { type RequirementClient, requirementClient } from './client/requirements.ts'
import { type SessionsClient, sessionsClient } from './client/sessions.ts'
import { type TaskClient, taskClient } from './client/tasks.ts'
import { type WorkersClient, workersClient } from './client/workers.ts'
import { type WorkspaceClient, workspaceClient } from './client/workspaces.ts'

// Re-export per-resource input / output types so the rest of the cli
// (commands, tests) can keep importing from '../client.ts'.
export type { ProjectInput } from './client/projects.ts'
export type { RequirementInput } from './client/requirements.ts'
export type {
  SessionRegistered,
  SessionRegisterInput,
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
// long-running `baton session run` daemon to emit events / heartbeat / close.
export type WorkerClient = {
  heartbeat(): Promise<{ attached: boolean }>
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
    heartbeat: () => request(u('/sessions/me/heartbeat'), { method: 'POST', headers: auth }),
    close: () => request(u('/sessions/me/close'), { method: 'POST', headers: auth }),
    emitEvent: (type, payload) =>
      request(u('/sessions/me/events'), {
        method: 'POST',
        body: { type, payload },
        headers: auth,
      }),
  }
}
