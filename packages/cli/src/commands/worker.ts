import { hostname as osHostname } from 'node:os'
import type { Id } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient, WorkerRegisterOutput } from '../client.ts'
import { resolveBaseUrl } from '../config.ts'
import { fmtWorker, renderList, renderOne, toJson } from '../output.ts'
import { clientFor, common, resolveProjectId } from '../util.ts'
import {
  loadWorkerConfigOrNull,
  saveWorkerConfig,
  type WorkerConfig,
  workerConfigPath,
} from '../worker/config.ts'
import { machineIdPath, readOrCreateMachineId } from '../worker/machine-id.ts'

// Resolve a worker positional arg: int id first, then name lookup.
const resolveWorker = async (
  client: ApiClient,
  projectId: Id,
  handle: string,
): Promise<{ id: Id; name: string }> => {
  const asInt = Number(handle)
  if (Number.isInteger(asInt) && asInt > 0) {
    const byId = await client.workers.get(asInt).catch(() => null)
    if (byId) return { id: byId.id, name: byId.name }
  }
  const byName = await client.workers.findByName(projectId, handle)
  if (byName) return { id: byName.id, name: byName.name }
  throw new Error(`worker "${handle}" not found in project ${projectId}`)
}

export type WorkerRegisterRunInput = {
  projectId: Id
  name: string
  server: string
  hostname: string
  machineId: string
}

// Pure handler: idempotent register + persist config locally. Returns the
// outcome so the CLI run() can format human output; tests assert the path.
export const registerWorker = async (
  client: ApiClient,
  input: WorkerRegisterRunInput,
  resolvePath: (projectId: Id) => string = workerConfigPath,
): Promise<{ out: WorkerRegisterOutput; configPath: string }> => {
  const out = await client.workers.register({
    projectId: input.projectId,
    machineId: input.machineId,
    name: input.name,
    hostname: input.hostname,
  })
  const config: WorkerConfig = {
    server: input.server,
    projectId: input.projectId,
    workerId: out.worker.id,
    name: out.worker.name,
    machineId: out.worker.machineId,
  }
  const configPath = resolvePath(input.projectId)
  saveWorkerConfig(configPath, config)
  return { out, configPath }
}

export const worker = defineCommand({
  meta: { name: 'worker', description: 'register / inspect / close workers for a project' },
  subCommands: {
    register: defineCommand({
      meta: {
        name: 'register',
        description: 'register this machine as a worker for a project (idempotent)',
      },
      args: {
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        name: { type: 'string', description: 'worker display name (default: hostname)' },
        ...common,
      },
      run: async ({ args }) => {
        const server = resolveBaseUrl(args.url)
        const c = clientFor(args)
        const hostname = osHostname()
        const machineId = readOrCreateMachineId()
        const name = args.name ?? hostname
        const { out, configPath } = await registerWorker(c, {
          projectId: resolveProjectId(args),
          name,
          server,
          hostname,
          machineId,
        })
        if (args.json) {
          console.log(toJson({ ...out, configPath, machineIdPath: machineIdPath() }))
          return
        }
        console.log(`worker #${out.worker.id} (${out.worker.name}) — ${out.outcome}`)
        console.log(`  hostname:       ${out.worker.hostname}`)
        console.log(`  machineId:      ${out.worker.machineId}`)
        console.log(`  machineId file: ${machineIdPath()}`)
        console.log(`  config saved:   ${configPath}`)
      },
    }),
    ls: defineCommand({
      meta: { name: 'ls', description: 'list workers in a project' },
      args: {
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const ws = await c.workers.listByProject(resolveProjectId(args))
        console.log(renderList(ws, fmtWorker, Boolean(args.json)))
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a worker by int id or name' },
      args: {
        worker: { type: 'positional', required: true, description: 'worker int id or name' },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const projectId = resolveProjectId(args)
        const handle = await resolveWorker(c, projectId, args.worker)
        const w = await c.workers.get(handle.id)
        console.log(renderOne(w, fmtWorker, Boolean(args.json)))
      },
    }),
    destroy: defineCommand({
      meta: {
        name: 'destroy',
        description: 'permanently delete a worker, its sessions, and event logs (irreversible)',
      },
      args: {
        worker: { type: 'positional', required: true, description: 'worker int id or name' },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        confirm: { type: 'boolean', description: 'actually perform the deletion' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const projectId = resolveProjectId(args)
        const handle = await resolveWorker(c, projectId, args.worker)
        const sessions = (await c.sessions.listByProject(projectId)).filter(
          s => s.workerId === handle.id,
        )
        const events = (await Promise.all(sessions.map(s => c.sessions.listEvents(s.id)))).reduce(
          (sum, list) => sum + list.length,
          0,
        )
        if (!args.confirm) {
          console.log(`[dry-run] would destroy worker ${handle.name} (#${handle.id}):`)
          console.log(`  - ${sessions.length} session(s) cascade-deleted`)
          console.log(`  - ${events} event(s) cascade-deleted`)
          console.log('re-run with --confirm to proceed.')
          return
        }
        await c.workers.destroy(handle.id)
        console.log(
          `destroyed worker ${handle.name} (#${handle.id}); ${sessions.length} session(s), ${events} event(s) gone`,
        )
      },
    }),
    whoami: defineCommand({
      meta: { name: 'whoami', description: 'show local worker config for a project' },
      args: {
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: ({ args }) => {
        const projectId = resolveProjectId(args)
        const cfg = loadWorkerConfigOrNull(workerConfigPath(projectId))
        if (!cfg) {
          console.log('(no worker registered for this project — run `baton worker register`)')
          return
        }
        if (args.json) {
          console.log(toJson(cfg))
          return
        }
        console.log(`worker #${cfg.workerId} (${cfg.name})`)
        console.log(`  machineId: ${cfg.machineId}`)
        console.log(`  server:    ${cfg.server}`)
      },
    }),
  },
})
