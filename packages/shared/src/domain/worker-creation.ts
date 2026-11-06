import type { Id } from './ids.ts'
import { AGENT_KINDS, type AgentKind } from './session.ts'
import type { Worker } from './worker.ts'

export type WorkerCreationStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type WorkerCreationStep = 'directory' | 'git' | 'register' | 'start' | 'connect'
export const WORKER_TEMPLATES = [
  { id: 'mini-glm-codeplan', name: 'GLM Code Plan', agentKinds: ['claude-code', 'pi'] },
  { id: 'mini-dashscope-codeplan', name: 'DashScope Code Plan', agentKinds: ['claude-code', 'pi'] },
  { id: 'mini-codex', name: '本机 Codex', agentKinds: ['codex'] },
] as const
export type ConfiguredWorkerTemplateId = (typeof WORKER_TEMPLATES)[number]['id']
export type WorkerTemplateId = ConfiguredWorkerTemplateId | 'mini-local'

export const workerTemplateAgentKinds = (id: string): readonly AgentKind[] =>
  id === 'mini-local'
    ? AGENT_KINDS
    : (WORKER_TEMPLATES.find(template => template.id === id)?.agentKinds ?? [])

export const isWorkerTemplateId = (value: unknown): value is WorkerTemplateId =>
  typeof value === 'string' && workerTemplateAgentKinds(value).length > 0

export type CreateWorkerInput = {
  templateId: WorkerTemplateId
  name: string
  agentKind: AgentKind
  // Share this project directory; omitted creates a new one.
  repoPath?: string
  // Omitted when the project's workspace has exactly one host.
  hostId?: Id
}
export type WorkerCreation = Omit<CreateWorkerInput, 'repoPath' | 'hostId'> & {
  id: Id
  projectId: Id
  hostId: Id
  machineId: string
  status: WorkerCreationStatus
  step: WorkerCreationStep | null
  error: string | null
  repoPath: string | null
  workerId: Id | null
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}
export type WorkerCreationReport =
  | { status: 'running'; step: WorkerCreationStep; repoPath?: string }
  | { status: 'failed'; error: string }
  | { status: 'succeeded' }
export type ProvisionerSignal = { action: 'create' | 'inspect'; creationId: Id }
export type CreationWorkerResult = { worker: Worker; apiToken: string }
export type WorkerTemplate = {
  id: WorkerTemplateId
  name: string
  agentKinds: AgentKind[]
  available: boolean
}
export type ReusableDirectory = { path: string; workerNames: string[] }

// Directories of the workers still alive on one host of a project, each with who
// works there. The same path on two hosts is two directories.
export const reusableDirectories = (
  creations: WorkerCreation[],
  hostId: Id,
): ReusableDirectory[] => {
  const directories = creations.reduce((found, creation) => {
    const { status, workerId, repoPath, name } = creation
    if (creation.hostId !== hostId || status !== 'succeeded' || workerId === null) return found
    if (repoPath === null) return found
    return found.set(repoPath, [...(found.get(repoPath) ?? []), name])
  }, new Map<string, string[]>())
  return [...directories].map(([path, workerNames]) => ({ path, workerNames }))
}
