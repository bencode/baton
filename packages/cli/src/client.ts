import { type ArtifactsClient, artifactsClient } from './client/artifacts.ts'
import { primeLogin } from './client/auth.ts'
import { type LoopsClient, loopsClient } from './client/loops.ts'
import { type ProjectClient, projectClient } from './client/projects.ts'
import { request, setAuthHeaders } from './client/request.ts'
import { type RequirementClient, requirementClient } from './client/requirements.ts'
import { type ServicesClient, servicesClient } from './client/services.ts'
import { type ExecutionClient, sessionExecutionClient } from './client/session-execution.ts'
import { type SessionsClient, sessionsClient } from './client/sessions.ts'
import { type TaskClient, taskClient } from './client/tasks.ts'
import { type WorkersClient, workersClient } from './client/workers.ts'
import { type WorkspaceClient, workspaceClient } from './client/workspaces.ts'

export type { LoopCreateInput, LoopUpdateInput } from './client/loops.ts'
export type { ProjectInput } from './client/projects.ts'
export type { RequirementInput } from './client/requirements.ts'
// Re-export per-resource input / output types so the rest of the cli
// (commands, tests) can keep importing from '../client.ts'.
export type { AttemptClient } from './client/session-execution.ts'
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
  artifacts: ArtifactsClient
  workspaces: WorkspaceClient
  projects: ProjectClient
  requirements: RequirementClient
  tasks: TaskClient
  sessions: SessionsClient
  services: ServicesClient
  loops: LoopsClient
  workers: WorkersClient
}

// Per-session write client used by a session child process: authenticates with
// the WORKER token and targets /sessions/:id/* (the worker owns the session).
// Claims and output are attempt-scoped; the child reports its attachment state.
export type WorkerClient = ExecutionClient & {
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
  artifacts: artifactsClient(baseUrl),
  workspaces: workspaceClient(baseUrl),
  projects: projectClient(baseUrl),
  requirements: requirementClient(baseUrl),
  tasks: taskClient(baseUrl),
  sessions: sessionsClient(baseUrl),
  services: servicesClient(baseUrl),
  loops: loopsClient(baseUrl),
  workers: workersClient(baseUrl),
})

export const createWorkerClient = (
  baseUrl: string,
  workerToken: string,
  sessionId: number,
): WorkerClient => {
  const headers = { authorization: `Bearer ${workerToken}` }
  return {
    ...sessionExecutionClient(baseUrl, sessionId, headers),
    setActive: active =>
      request(`${baseUrl}/sessions/${sessionId}/status`, {
        method: 'POST',
        body: { active },
        headers,
      }),
  }
}
