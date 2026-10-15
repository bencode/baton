import type { Id } from './ids.ts'
import type { AgentKind } from './session.ts'
import type { Worker } from './worker.ts'

export type WorkerCreationStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type WorkerCreationStep = 'directory' | 'git' | 'register' | 'start' | 'connect'
export type CreateWorkerInput = {
  templateId: 'mini-local'
  name: string
  agentKind: AgentKind
}
export type WorkerCreation = CreateWorkerInput & {
  id: Id
  projectId: Id
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
  id: 'mini-local'
  name: string
  agentKinds: AgentKind[]
  available: boolean
}
