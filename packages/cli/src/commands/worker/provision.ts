import { AGENT_KINDS, isAgentKind } from '@baton/shared'
import { defineCommand } from 'citty'
import { fmtWorkerCreation, fmtWorkerTemplate, renderList, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'

const projectArg = {
  project: { type: 'string' as const, description: 'project id (overrides .baton.json)' },
}
const positiveId = (raw: string | number): number => {
  const id = Number(raw)
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('positive id required')
  return id
}
export const workerTemplatesCommand = defineCommand({
  meta: { name: 'templates', description: 'list worker creation templates for a project' },
  args: { ...projectArg, ...common },
  run: async ({ args }) => {
    const list = await clientFor(args).workerCreations.templates(positiveId(resolveProjectId(args)))
    console.log(renderList(list, fmtWorkerTemplate, Boolean(args.json)))
  },
})
export const workerCreateCommand = defineCommand({
  meta: { name: 'create', description: 'request a worker from the mini template (asynchronous)' },
  args: {
    ...projectArg,
    ...common,
    template: { type: 'string', required: true, description: 'mini-local' },
    name: { type: 'string', required: true, description: 'worker name' },
    agentKind: { type: 'string', default: 'claude-code', description: AGENT_KINDS.join(', ') },
  },
  run: async ({ args }) => {
    if (args.template !== 'mini-local') throw new Error('template must be mini-local')
    if (!isAgentKind(args.agentKind)) throw new Error('invalid agentKind')
    const name = args.name.trim()
    if (!name) throw new Error('worker name required')
    const creation = await clientFor(args).workerCreations.create(
      positiveId(resolveProjectId(args)),
      {
        templateId: 'mini-local',
        name,
        agentKind: args.agentKind,
      },
    )
    console.log(renderOne(creation, fmtWorkerCreation, Boolean(args.json)))
  },
})
export const workerCreationCommand = defineCommand({
  meta: { name: 'creation', description: 'inspect worker creation records' },
  subCommands: {
    ls: defineCommand({
      args: { ...projectArg, ...common },
      run: async ({ args }) => {
        const list = await clientFor(args).workerCreations.listByProject(
          positiveId(resolveProjectId(args)),
        )
        console.log(renderList(list, fmtWorkerCreation, Boolean(args.json)))
      },
    }),
    get: defineCommand({
      args: { ...common, id: { type: 'positional', required: true } },
      run: async ({ args }) => {
        const creation = await clientFor(args).workerCreations.get(positiveId(args.id))
        console.log(renderOne(creation, fmtWorkerCreation, Boolean(args.json)))
      },
    }),
  },
})
