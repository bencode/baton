import type { Id } from '@baton/shared'
import { type AdminApi, adminApi } from './admin'
import { type AuthApi, authApi } from './auth'
import { type ChannelsApi, channelsApi } from './channels'
import { type LoopsApi, loopsApi } from './loops'
import { type ProjectsApi, projectsApi } from './projects'
import { API_BASE, request, type Url, urlFor } from './request'
import { type RequirementsApi, requirementsApi } from './requirements'
import { type SessionsApi, sessionsApi } from './sessions'
import { type TasksApi, tasksApi } from './tasks'
import { type WorkersApi, workersApi } from './workers'
import { type WorkspacesApi, workspacesApi } from './workspaces'

export type { LoopInput, LoopPatch } from './loops'
export type { ProjectInput } from './projects'
// Re-export the public surface so existing `from '../api'` imports keep resolving
// (this index replaces the former single api.ts).
export { API_BASE, attachmentSrc } from './request'
export type { RequirementInput } from './requirements'
export type { EventQuery } from './sessions'
export type { TaskInput } from './tasks'
export type { WorkspaceInput } from './workspaces'

// web's own HTTP client (browser fetch), mirroring the server routes. Each
// resource lives in its own module; this assembles them into the Api surface the
// app consumes via ApiContext.
export type Api = {
  health(): Promise<{ ok: boolean }>
  auth: AuthApi
  workspaces: WorkspacesApi
  projects: ProjectsApi
  channels: ChannelsApi
  requirements: RequirementsApi
  tasks: TasksApi
  sessions: SessionsApi
  loops: LoopsApi
  workers: WorkersApi
  admin: AdminApi
  // SSE URL for a session's transcript (EventSource sends the cookie same-origin).
  // Live-only — history comes from sessions.listEvents (one fetch), so the stream
  // never replays the whole transcript.
  sessionStreamUrl(id: Id): string
}

export const createApi = (base: string = API_BASE): Api => {
  const u: Url = urlFor(base)
  return {
    health: () => request(u('/health'), { method: 'GET' }),
    auth: authApi(u),
    workspaces: workspacesApi(u),
    projects: projectsApi(u),
    channels: channelsApi(u),
    requirements: requirementsApi(u),
    tasks: tasksApi(u),
    sessions: sessionsApi(u),
    loops: loopsApi(u),
    workers: workersApi(u),
    admin: adminApi(u),
    sessionStreamUrl: id => u(`/sessions/${id}/stream?live=1`),
  }
}
