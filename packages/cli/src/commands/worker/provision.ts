import {
  AGENT_KINDS,
  isAgentKind,
  isWorkerTemplateId,
  workerTemplateAgentKinds,
} from '@baton/shared'
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
    template: {
      type: 'string',
      required: true,
      description: 'mini-glm-codeplan | mini-dashscope-codeplan | mini-codex',
    },
    name: { type: 'string', required: true, description: 'worker name' },
    agentKind: { type: 'string', description: AGENT_KINDS.join(', ') },
  },
  run: async ({ args }) => {
    if (!isWorkerTemplateId(args.template)) throw new Error('invalid worker template')
    const agentKind = args.agentKind ?? workerTemplateAgentKinds(args.template)[0]
    if (!isAgentKind(agentKind)) throw new Error('invalid agentKind')
    if (!workerTemplateAgentKinds(args.template).includes(agentKind))
      throw new Error('agentKind is not supported by this template')
    const name = args.name.trim()
    if (!name) throw new Error('worker name required')
    const creation = await clientFor(args).workerCreations.create(
      positiveId(resolveProjectId(args)),
      {
        templateId: args.template,
        name,
        agentKind,
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
