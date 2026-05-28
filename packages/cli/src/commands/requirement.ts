import type { Id, RequirementStatus } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { fmtRequirement, removed, renderList, renderOne } from '../output.ts'
import { clientFor, common, splitCsv } from '../util.ts'

export const createRequirement = (
  c: ApiClient,
  input: { projectId: Id; title: string; description?: string; tags?: string[] },
  json: boolean,
): Promise<string> => c.requirements.create(input).then(r => renderOne(r, fmtRequirement, json))
export const listRequirements = (c: ApiClient, projectId: Id, json: boolean): Promise<string> =>
  c.requirements.listByProject(projectId).then(rs => renderList(rs, fmtRequirement, json))
export const getRequirement = (c: ApiClient, id: Id, json: boolean): Promise<string> =>
  c.requirements.get(id).then(r => renderOne(r, fmtRequirement, json))
export const setRequirementStatus = (
  c: ApiClient,
  id: Id,
  status: RequirementStatus,
  json: boolean,
): Promise<string> =>
  c.requirements.setStatus(id, status).then(r => renderOne(r, fmtRequirement, json))
export const removeRequirement = (
  c: ApiClient,
  id: Id,
  label: string,
  json: boolean,
): Promise<string> => c.requirements.remove(id).then(() => removed('requirement', label, json))

// Resolve a project-scoped requirement code (R-N) to its int id via the server.
const resolveByCode = async (c: ApiClient, projectId: Id, code: string): Promise<Id> =>
  (await c.requirements.getByCode(projectId, code)).id

export const requirement = defineCommand({
  meta: { name: 'requirement', description: 'manage requirements' },
  subCommands: {
    create: defineCommand({
      meta: { name: 'create', description: 'create a requirement' },
      args: {
        title: { type: 'positional', required: true },
        project: { type: 'string', required: true, description: 'project id (int)' },
        desc: { type: 'string', description: 'description' },
        tags: { type: 'string', description: 'comma-separated tags' },
        ...common,
      },
      run: async ({ args }) => {
        console.log(
          await createRequirement(
            clientFor(args),
            {
              projectId: Number(args.project),
              title: args.title,
              description: args.desc,
              tags: splitCsv(args.tags),
            },
            Boolean(args.json),
          ),
        )
      },
    }),
    ls: defineCommand({
      meta: { name: 'ls', description: 'list requirements in a project' },
      args: {
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        console.log(
          await listRequirements(clientFor(args), Number(args.project), Boolean(args.json)),
        )
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a requirement by code (R-N)' },
      args: {
        code: { type: 'positional', required: true, description: 'requirement code, e.g. R-1' },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveByCode(c, Number(args.project), args.code)
        console.log(await getRequirement(c, id, Boolean(args.json)))
      },
    }),
    'set-status': defineCommand({
      meta: { name: 'set-status', description: 'set requirement status (active|done|cancelled)' },
      args: {
        code: { type: 'positional', required: true, description: 'requirement code (R-N)' },
        status: { type: 'positional', required: true },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveByCode(c, Number(args.project), args.code)
        console.log(
          await setRequirementStatus(c, id, args.status as RequirementStatus, Boolean(args.json)),
        )
      },
    }),
    rm: defineCommand({
      meta: { name: 'rm', description: 'delete a requirement by code' },
      args: {
        code: { type: 'positional', required: true },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveByCode(c, Number(args.project), args.code)
        console.log(await removeRequirement(c, id, args.code, Boolean(args.json)))
      },
    }),
  },
})
