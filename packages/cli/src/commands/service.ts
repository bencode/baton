import { type Id, isServiceNote, isServicePublicUrl, type ServicePresence } from '@baton/shared'
import { defineCommand } from 'citty'
import { toJson } from '../output.ts'
import { loadProjectConfig, projectConfigPath } from '../project-config.ts'
import { clientFor, common, resolveProjectId } from '../util.ts'
import { serviceChildCommand } from '../worker/service-child.ts'

const serviceHandle = (service: ServicePresence): string => `W-${service.workerId}/${service.name}`

const formatUptime = (startedAt: number, now = Date.now()): string => {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
  return `${seconds}s`
}

const currentContext = (): { workerId: Id; sessionId: Id } => {
  const config = loadProjectConfig(projectConfigPath())
  if (!config.worker || !config.session)
    throw new Error('service run requires a Baton session worktree')
  return { workerId: config.worker.id, sessionId: config.session }
}

const currentWorker = (): Id => {
  const worker = loadProjectConfig(projectConfigPath()).worker
  if (!worker) throw new Error('no worker in scope')
  return worker.id
}

const parseTarget = (target: string): { workerId: Id; name: string } => {
  const explicit = target.match(/^W-(\d+)\/(.+)$/i)
  return explicit
    ? { workerId: Number(explicit[1]), name: explicit[2] ?? '' }
    : { workerId: currentWorker(), name: target }
}

const runCommand = defineCommand({
  meta: { name: 'run', description: 'run a service on the current worker' },
  args: {
    name: { type: 'positional', required: true, description: 'service name' },
    'public-url': { type: 'string', description: 'public HTTP(S) URL for this service' },
    note: { type: 'string', description: 'short note describing this service' },
    ...common,
  },
  run: async ({ args, rawArgs }) => {
    const separator = rawArgs.indexOf('--')
    const argv = separator === -1 ? [] : rawArgs.slice(separator + 1)
    if (argv.length === 0) throw new Error('command required after `--`')
    const publicUrl = args['public-url']?.trim() || undefined
    const note = args.note?.trim() || undefined
    if (publicUrl && !isServicePublicUrl(publicUrl))
      throw new Error('--public-url must be an absolute HTTP(S) URL')
    if (note && !isServiceNote(note))
      throw new Error('service note must be 500 characters or fewer')
    const context = currentContext()
    const result = await clientFor(args).services.run(context.workerId, {
      sessionId: context.sessionId,
      name: args.name,
      argv,
      ...(publicUrl ? { publicUrl } : {}),
      ...(note ? { note } : {}),
    })
    if (!result.ok) throw new Error(result.error)
    if (args.json) return console.log(toJson(result))
    console.log(`running W-${context.workerId}/${args.name}`)
    if (publicUrl) console.log(`public: ${publicUrl}`)
    if (result.logPath) console.log(`logs: ${result.logPath}`)
  },
})

const lsCommand = defineCommand({
  meta: { name: 'ls', description: 'list live services in the current project' },
  args: common,
  run: async ({ args }) => {
    const client = clientFor(args)
    const projectId = resolveProjectId({})
    const services = await client.services.listByProject(projectId)
    if (args.json) return console.log(toJson(services))
    if (services.length === 0) return console.log('(none)')
    const workers = await client.workers.listByProject(projectId)
    const names = new Map(workers.map(worker => [worker.id, worker.name]))
    services
      .sort((a, b) => a.workerId - b.workerId || a.name.localeCompare(b.name))
      .map(
        item =>
          `${serviceHandle(item)}  ${names.get(item.workerId) ?? 'unknown'}  session=${item.sessionId}  uptime=${formatUptime(item.startedAt)}`,
      )
      .forEach(line => {
        console.log(line)
      })
  },
})

const stopCommand = defineCommand({
  meta: { name: 'stop', description: 'stop and remove a live service' },
  args: {
    service: {
      type: 'positional',
      required: true,
      description: 'service name, or W-N/name',
    },
    ...common,
  },
  run: async ({ args }) => {
    const target = parseTarget(args.service)
    await clientFor(args).services.stop(target.workerId, target.name)
    console.log(args.json ? toJson({ ok: true, service: args.service }) : `stopped ${args.service}`)
  },
})

export const service = defineCommand({
  meta: { name: 'service', description: 'run and stop worker-managed development services' },
  subCommands: { run: runCommand, ls: lsCommand, stop: stopCommand, child: serviceChildCommand },
})
