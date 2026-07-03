import { hostname as osHostname } from 'node:os'
import type { AgentKind, Id } from '@baton/shared'
import { defineCommand } from 'citty'
import { type ApiClient, createClient, type WorkerRegisterOutput } from '../../client.ts'
import { resolveBaseUrlOrNull } from '../../config.ts'
import { fmtWorker, renderList, renderOne, toJson } from '../../output.ts'
import {
  configPathFromArgs,
  loadProjectConfig,
  loadProjectConfigOrNull,
  projectConfigPath,
  saveProjectConfig,
  setWorker,
  viewWorker,
} from '../../project-config.ts'
import { clientFor, common, parseWorkerHandle, resolveAuth, resolveProjectId } from '../../util.ts'
import { runWorkerDaemon } from '../../worker/daemon.ts'
import { machineIdPath, readOrCreateMachineId } from '../../worker/machine-id.ts'

// Resolve a worker positional arg: global id ("7" / "W-7") first, then a
// project-scoped name lookup.
const resolveWorker = async (
  client: ApiClient,
  projectId: Id,
  handle: string,
): Promise<{ id: Id; name: string }> => {
  const asId = parseWorkerHandle(handle)
  if (asId !== null) {
    const byId = await client.workers.get(asId).catch(() => null)
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
  agentKind: AgentKind
}

const parseAgentKind = (value: unknown): AgentKind => {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : 'claude-code'
  if (raw === 'claude-code' || raw === 'codex') return raw
  throw new Error(`invalid agent kind "${raw}" (expected claude-code or codex)`)
}

// Pure handler: idempotent register + persist worker section into .baton.json.
// If the file is missing, we seed it with {server, project} so this command
// works for users who skipped `baton init`. Tests assert the configPath.
export const registerWorker = async (
  client: ApiClient,
  input: WorkerRegisterRunInput,
  cfgPath: string = projectConfigPath(),
): Promise<{ out: WorkerRegisterOutput; configPath: string }> => {
  const out = await client.workers.register({
    projectId: input.projectId,
    agentKind: input.agentKind,
    machineId: input.machineId,
    name: input.name,
    hostname: input.hostname,
  })
  // Tolerate a missing .baton.json: seed it. (Init would normally have done
  // this, but the worker section is the only thing we strictly need.)
  try {
    loadProjectConfig(cfgPath)
  } catch {
    saveProjectConfig(cfgPath, { server: input.server, project: input.projectId })
  }
  setWorker(cfgPath, {
    id: out.worker.id,
    name: out.worker.name,
    agentKind: out.worker.agentKind,
    machineId: out.worker.machineId,
    apiToken: out.apiToken,
  })
  return { out, configPath: cfgPath }
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
        config: {
          type: 'string',
          description: 'path to the worker config file (default: ./.baton.json)',
        },
        agentKind: {
          type: 'string',
          description: 'agent engine for new sessions: claude-code or codex',
        },
        ...common,
      },
      run: async ({ args }) => {
        // Require an explicit server — don't silently register against localhost.
        const server = resolveBaseUrlOrNull(args.url)
        if (!server)
          throw new Error(
            'no baton server — pass --url <url> (e.g. https://baton.fmap.dev/api), set BATON_URL, or run `baton init`',
          )
        if (!args.json) console.log(`registering against ${server}`)
        // Register is server-gated now (assertProjectAccess) — send a Bearer:
        // BATON_TOKEN/BATON_WORKER_TOKEN env first, else the file worker token (a
        // re-register from .baton.json). Mirrors clientFor, but reuses the already-
        // validated `server` + the --config location. No token → 401 from the gate.
        const cfgPath = configPathFromArgs(args)
        const fileToken = loadProjectConfigOrNull(cfgPath)?.worker?.apiToken
        const auth = resolveAuth(process.env, fileToken)
        const c = createClient(server, auth && auth !== 'cookie' ? auth : undefined)
        const hostname = osHostname()
        const machineId = readOrCreateMachineId()
        const name = args.name ?? hostname
        const agentKind = parseAgentKind(args.agentKind ?? process.env.BATON_AGENT_KIND)
        const { out, configPath } = await registerWorker(
          c,
          {
            projectId: resolveProjectId(args),
            name,
            server,
            hostname,
            machineId,
            agentKind,
          },
          cfgPath,
        )
        if (args.json) {
          console.log(toJson({ ...out, configPath, machineIdPath: machineIdPath() }))
          return
        }
        console.log(`worker #${out.worker.id} (${out.worker.name}) — ${out.outcome}`)
        console.log(`  agentKind:      ${out.worker.agentKind}`)
        console.log(`  hostname:       ${out.worker.hostname}`)
        console.log(`  machineId:      ${out.worker.machineId}`)
        console.log(`  machineId file: ${machineIdPath()}`)
        console.log(`  config saved:   ${configPath}`)
      },
    }),
    run: defineCommand({
      meta: {
        name: 'run',
        description:
          'run the persistent worker daemon (listens for session create/delete commands)',
      },
      args: {
        config: {
          type: 'string',
          description: 'path to the worker config file (default: ./.baton.json)',
        },
        ...common,
      },
      run: async ({ args }) => {
        const cfg = viewWorker(loadProjectConfig(configPathFromArgs(args)))
        const client = createClient(cfg.server, { bearer: cfg.apiToken })
        const ac = new AbortController()
        const stop = (): void => ac.abort()
        process.on('SIGINT', stop)
        process.on('SIGTERM', stop)
        await runWorkerDaemon(cfg, client, ac.signal)
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
        description: 'permanently delete a worker and its sessions (irreversible)',
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
        if (!args.confirm) {
          console.log(`[dry-run] would destroy worker ${handle.name} (#${handle.id}):`)
          console.log(`  - ${sessions.length} session(s) cascade-deleted`)
          console.log('  - browser-local event history: NOT touched')
          console.log('re-run with --confirm to proceed.')
          return
        }
        await c.workers.destroy(handle.id)
        console.log(
          `destroyed worker ${handle.name} (#${handle.id}); ${sessions.length} session(s) gone`,
        )
      },
    }),
    whoami: defineCommand({
      meta: { name: 'whoami', description: 'show local worker config from .baton.json' },
      args: {
        config: {
          type: 'string',
          description: 'path to the worker config file (default: ./.baton.json)',
        },
        ...common,
      },
      run: ({ args }) => {
        const cfg = (() => {
          try {
            return loadProjectConfig(configPathFromArgs(args))
          } catch {
            return null
          }
        })()
        const worker = cfg?.worker
        if (!worker) {
          console.log('(no worker registered for this project — run `baton worker register`)')
          return
        }
        if (args.json) {
          console.log(toJson({ ...worker, server: cfg?.server, projectId: cfg?.project }))
          return
        }
        console.log(`worker #${worker.id} (${worker.name})`)
        console.log(`  machineId: ${worker.machineId}`)
        console.log(`  agentKind: ${worker.agentKind ?? 'claude-code'}`)
        console.log(`  server:    ${cfg?.server}`)
      },
    }),
  },
})
