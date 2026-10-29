import {
  type CreateWorkerInput,
  type CreationWorkerResult,
  type Id,
  isAgentKind,
  isWorkerTemplateId,
  type Worker,
  type WorkerCreation,
  type WorkerCreationReport,
  type WorkerCreationStep,
  workerTemplateAgentKinds,
} from '@baton/shared'
import type { CommandBus } from '../command-bus.ts'
import type { ProjectBus } from '../project-bus.ts'
import type { Store, WorkerCreationPatch } from '../store/types.ts'
import type { ProvisionerBus } from './bus.ts'

export class WorkerCreationError extends Error {
  constructor(
    public readonly status: 400 | 404 | 409 | 503,
    message: string,
  ) {
    super(message)
  }
}
export type ProvisioningDeps = {
  store: Store
  bus: ProvisionerBus
  commands: CommandBus
  projects: ProjectBus
}
const steps: WorkerCreationStep[] = ['directory', 'git', 'register', 'start', 'connect']
const active = (c: WorkerCreation): boolean => c.status === 'pending' || c.status === 'running'

export const creationBody = (value: unknown): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new WorkerCreationError(400, 'object body required')
  return value as Record<string, unknown>
}
export const parseCreateWorkerInput = (value: unknown): CreateWorkerInput => {
  const body = creationBody(value)
  const name = typeof body.name === 'string' ? body.name.trim() : ''
  if (!name || !isWorkerTemplateId(body.templateId) || !isAgentKind(body.agentKind))
    throw new WorkerCreationError(400, 'name, valid templateId, and agentKind required')
  if (!workerTemplateAgentKinds(body.templateId).includes(body.agentKind))
    throw new WorkerCreationError(400, 'agentKind is not supported by this template')
  return { name, templateId: body.templateId, agentKind: body.agentKind }
}
export const parseCreationReport = (value: unknown): WorkerCreationReport => {
  const body = creationBody(value)
  if (body.status === 'succeeded') return { status: 'succeeded' }
  if (body.status === 'failed' && typeof body.error === 'string' && body.error.trim())
    return { status: 'failed', error: body.error.trim() }
  if (
    body.status === 'running' &&
    steps.some(step => step === body.step) &&
    (body.repoPath === undefined || (typeof body.repoPath === 'string' && body.repoPath.trim()))
  )
    return {
      status: 'running',
      step: body.step as WorkerCreationStep,
      ...(typeof body.repoPath === 'string' ? { repoPath: body.repoPath.trim() } : {}),
    }
  throw new WorkerCreationError(400, 'valid status, step, and error or repoPath required')
}
export const loadWorkerCreation = async (store: Store, id: Id): Promise<WorkerCreation> => {
  const creation = await store.workerCreations.get(id)
  if (!creation) throw new WorkerCreationError(404, 'creation not found')
  return creation
}
const save = async (
  deps: ProvisioningDeps,
  creation: WorkerCreation,
  patch: WorkerCreationPatch,
) => {
  const updated = await deps.store.workerCreations.update(creation.id, patch)
  deps.projects.publish(creation.projectId, { resource: 'worker-creations' })
  return updated
}
const matchesWorker = (creation: WorkerCreation, worker: Worker): boolean =>
  worker.projectId === creation.projectId &&
  worker.machineId === creation.machineId &&
  worker.agentKind === creation.agentKind &&
  worker.name === creation.name

export const createWorkerCreation = async (
  deps: ProvisioningDeps,
  projectId: Id,
  input: CreateWorkerInput,
): Promise<WorkerCreation> => {
  if (!(await deps.store.projects.get(projectId)))
    throw new WorkerCreationError(404, 'project not found')
  if (!deps.bus.has('mini')) throw new WorkerCreationError(503, 'mini provisioner is offline')
  const [workers, creations] = await Promise.all([
    deps.store.workers.listByProject(projectId),
    deps.store.workerCreations.listByProject(projectId),
  ])
  if (
    workers.some(w => w.name === input.name) ||
    creations.some(c => active(c) && c.name === input.name)
  )
    throw new WorkerCreationError(409, 'worker name already in use in project')
  const creation = await deps.store.workerCreations.create({ ...input, projectId })
  deps.projects.publish(projectId, { resource: 'worker-creations' })
  deps.bus.publish('mini', { action: 'create', creationId: creation.id })
  return creation
}

export const registerCreationWorker = async (
  deps: ProvisioningDeps,
  creationId: Id,
  hostname: string,
): Promise<CreationWorkerResult> => {
  if (!hostname.trim()) throw new WorkerCreationError(400, 'hostname required')
  const creation = await loadWorkerCreation(deps.store, creationId)
  const associated =
    creation.workerId === null ? null : await deps.store.workers.get(creation.workerId)
  if (associated && !matchesWorker(creation, associated))
    throw new WorkerCreationError(409, 'associated worker no longer matches creation')
  if (!associated && (creation.status !== 'running' || creation.step !== 'register'))
    throw new WorkerCreationError(409, 'creation must be registering')
  const out = await deps.store.workers.register({
    projectId: creation.projectId,
    name: creation.name,
    agentKind: creation.agentKind,
    machineId: creation.machineId,
    hostname: hostname.trim(),
  })
  if (out.kind === 'name-collision')
    throw new WorkerCreationError(409, 'worker name already in use')
  if (creation.workerId !== out.worker.id) await save(deps, creation, { workerId: out.worker.id })
  deps.projects.publish(creation.projectId, { resource: 'workers' })
  return { worker: out.worker, apiToken: out.apiToken }
}

const progressPatch = (
  creation: WorkerCreation,
  report: Extract<WorkerCreationReport, { status: 'running' }>,
): WorkerCreationPatch => {
  const previous = creation.step === null ? -1 : steps.indexOf(creation.step)
  const next = steps.indexOf(report.step)
  if (next !== previous && next !== previous + 1)
    throw new WorkerCreationError(409, 'steps must advance in order')
  if (next >= steps.indexOf('start') && creation.workerId === null)
    throw new WorkerCreationError(409, 'worker must be registered before start')
  return {
    status: 'running',
    step: report.step,
    ...(report.repoPath === undefined ? {} : { repoPath: report.repoPath }),
  }
}
const completionPatch = async (
  deps: ProvisioningDeps,
  creation: WorkerCreation,
): Promise<WorkerCreationPatch> => {
  const worker = creation.workerId === null ? null : await deps.store.workers.get(creation.workerId)
  if (
    creation.step !== 'connect' ||
    !worker ||
    !matchesWorker(creation, worker) ||
    !deps.commands.has(worker.id)
  )
    throw new WorkerCreationError(409, 'matching worker must be connected before success')
  return { status: 'succeeded', finishedAt: Date.now() }
}
export const reportWorkerCreation = async (
  deps: ProvisioningDeps,
  creationId: Id,
  input: WorkerCreationReport,
): Promise<WorkerCreation> => {
  const creation = await loadWorkerCreation(deps.store, creationId)
  if (!active(creation)) {
    if (
      input.status === creation.status &&
      (input.status !== 'failed' || input.error === creation.error)
    )
      return creation
    throw new WorkerCreationError(409, 'creation is already finished')
  }
  const patch =
    input.status === 'running'
      ? progressPatch(creation, input)
      : input.status === 'failed'
        ? { status: 'failed' as const, error: input.error, finishedAt: Date.now() }
        : await completionPatch(deps, creation)
  return save(deps, creation, patch)
}
