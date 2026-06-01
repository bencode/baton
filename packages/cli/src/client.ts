import type { SessionEvent, SessionEventType } from '@baton/shared'
import { primeLogin } from './client/auth.ts'
import { type ProjectClient, projectClient } from './client/projects.ts'
import { request, setAuthHeaders } from './client/request.ts'
import { type RequirementClient, requirementClient } from './client/requirements.ts'
import { type SessionsClient, sessionsClient } from './client/sessions.ts'
import { type TaskClient, taskClient } from './client/tasks.ts'
import { type WorkersClient, workersClient } from './client/workers.ts'
import { type WorkspaceClient, workspaceClient } from './client/workspaces.ts'

// Re-export per-resource input / output types so the rest of the cli
// (commands, tests) can keep importing from '../client.ts'.
export type { ProjectInput } from './client/projects.ts'
export type { RequirementInput } from './client/requirements.ts'
export type { SessionCreateInput } from './client/sessions.ts'
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

// Per-session write client used by a session child process: authenticates with
// the WORKER token and targets /sessions/:id/* (the worker owns the session).
// Liveness/active is reported by the worker daemon, not the child — this only
// emits turn/sdk events.
export type WorkerClient = {
  emitEvent(type: SessionEventType, payload: unknown): Promise<SessionEvent>
  // Reported by the child once its stream subscription is open, so `attached`
  // means "ready to receive" (not just "spawned"). Daemon still reports inactive
  // on child exit.
  setActive(active: boolean): Promise<unknown>
}

// `bearer` → the worker daemon / session child: authenticate every request with
// the worker token (reads included), and skip the cookie login (machine
// principal, no user). Otherwise prime a transparent cookie login when
// BATON_USER/PASS are set; every request waits on it. No-op without creds.
export const createClient = (baseUrl: string, opts?: { bearer?: string }): ApiClient => {
  if (opts?.bearer) setAuthHeaders({ authorization: `Bearer ${opts.bearer}` })
  else primeLogin(baseUrl)
  return clientFromBase(baseUrl)
}

const clientFromBase = (baseUrl: string): ApiClient => ({
  workspaces: workspaceClient(baseUrl),
  projects: projectClient(baseUrl),
  requirements: requirementClient(baseUrl),
  tasks: taskClient(baseUrl),
  sessions: sessionsClient(baseUrl),
  workers: workersClient(baseUrl),
})

export const createWorkerClient = (
  baseUrl: string,
  workerToken: string,
  sessionId: number,
): WorkerClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  const auth = { authorization: `Bearer ${workerToken}` }
  return {
    emitEvent: (type, payload) =>
      request(u(`/sessions/${sessionId}/events`), {
        method: 'POST',
        body: { type, payload },
        headers: auth,
      }),
    setActive: active =>
      request(u(`/sessions/${sessionId}/status`), {
        method: 'POST',
        body: { active },
        headers: auth,
      }),
  }
}
