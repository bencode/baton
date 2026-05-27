import type { RequirementStatus } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { fmtRequirement, removed, renderList, renderOne } from '../output.ts'
import { clientFor, common, splitCsv } from '../util.ts'

export const createRequirement = (
  c: ApiClient,
  input: { projectId: string; title: string; description?: string; tags?: string[] },
  json: boolean,
): Promise<string> => c.requirements.create(input).then(r => renderOne(r, fmtRequirement, json))
export const listRequirements = (c: ApiClient, projectId: string, json: boolean): Promise<string> =>
  c.requirements.listByProject(projectId).then(rs => renderList(rs, fmtRequirement, json))
export const getRequirement = (c: ApiClient, id: string, json: boolean): Promise<string> =>
  c.requirements.get(id).then(r => renderOne(r, fmtRequirement, json))
export const setRequirementStatus = (
  c: ApiClient,
  id: string,
  status: RequirementStatus,
  json: boolean,
): Promise<string> =>
  c.requirements.setStatus(id, status).then(r => renderOne(r, fmtRequirement, json))
export const removeRequirement = (c: ApiClient, id: string, json: boolean): Promise<string> =>
  c.requirements.remove(id).then(() => removed('requirement', id, json))

export const requirement = defineCommand({
  meta: { name: 'requirement', description: 'manage requirements' },
  subCommands: {
    create: defineCommand({
      meta: { name: 'create', description: 'create a requirement' },
      args: {
        title: { type: 'positional', required: true },
        project: { type: 'string', required: true, description: 'project id' },
        desc: { type: 'string', description: 'description' },
        tags: { type: 'string', description: 'comma-separated tags' },
        ...common,
      },
      run: async ({ args }) => {
        const out = await createRequirement(
          clientFor(args),
          {
            projectId: args.project,
            title: args.title,
            description: args.desc,
            tags: splitCsv(args.tags),
          },
          Boolean(args.json),
        )
        console.log(out)
      },
    }),
    ls: defineCommand({
      meta: { name: 'ls', description: 'list requirements in a project' },
      args: { project: { type: 'string', required: true, description: 'project id' }, ...common },
      run: async ({ args }) => {
        console.log(await listRequirements(clientFor(args), args.project, Boolean(args.json)))
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a requirement' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await getRequirement(clientFor(args), args.id, Boolean(args.json)))
      },
    }),
    'set-status': defineCommand({
      meta: { name: 'set-status', description: 'set requirement status (active|done|cancelled)' },
      args: {
        id: { type: 'positional', required: true },
        status: { type: 'positional', required: true },
        ...common,
      },
      run: async ({ args }) => {
        const out = await setRequirementStatus(
          clientFor(args),
          args.id,
          args.status as RequirementStatus,
          Boolean(args.json),
        )
        console.log(out)
      },
    }),
    rm: defineCommand({
      meta: { name: 'rm', description: 'delete a requirement' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await removeRequirement(clientFor(args), args.id, Boolean(args.json)))
      },
    }),
  },
})
