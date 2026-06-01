import type { Id } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ProjectPatch } from '../client/projects.ts'
import type { ApiClient } from '../client.ts'
import { fmtProject, removed, renderList, renderOne } from '../output.ts'
import { clientFor, common, resolveWorkspaceId } from '../util.ts'

export const createProject = (
  c: ApiClient,
  input: { workspaceId: Id; name: string; description?: string },
  json: boolean,
): Promise<string> => c.projects.create(input).then(p => renderOne(p, fmtProject, json))
export const listProjects = (c: ApiClient, workspaceId: Id, json: boolean): Promise<string> =>
  c.projects.listByWorkspace(workspaceId).then(ps => renderList(ps, fmtProject, json))
export const getProject = (c: ApiClient, id: Id, json: boolean): Promise<string> =>
  c.projects.get(id).then(p => renderOne(p, fmtProject, json))
export const updateProject = (
  c: ApiClient,
  id: Id,
  patch: ProjectPatch,
  json: boolean,
): Promise<string> => c.projects.update(id, patch).then(p => renderOne(p, fmtProject, json))
export const removeProject = (c: ApiClient, id: Id, json: boolean): Promise<string> =>
  c.projects.remove(id).then(() => removed('project', id, json))

export const project = defineCommand({
  meta: { name: 'project', description: 'manage projects' },
  subCommands: {
    create: defineCommand({
      meta: { name: 'create', description: 'create a project' },
      args: {
        name: { type: 'positional', required: true },
        workspace: { type: 'string', description: 'workspace id (overrides .baton.json)' },
        desc: { type: 'string', description: 'description' },
        ...common,
      },
      run: async ({ args }) => {
        const out = await createProject(
          clientFor(args),
          { workspaceId: resolveWorkspaceId(args), name: args.name, description: args.desc },
          Boolean(args.json),
        )
        console.log(out)
      },
    }),
    ls: defineCommand({
      meta: { name: 'ls', description: 'list projects in a workspace' },
      args: {
        workspace: { type: 'string', description: 'workspace id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        console.log(
          await listProjects(clientFor(args), resolveWorkspaceId(args), Boolean(args.json)),
        )
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a project' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await getProject(clientFor(args), Number(args.id), Boolean(args.json)))
      },
    }),
    update: defineCommand({
      meta: { name: 'update', description: 'rename a project / set its description' },
      args: {
        id: { type: 'positional', required: true },
        name: { type: 'string', description: 'new name' },
        desc: { type: 'string', description: 'new description' },
        ...common,
      },
      run: async ({ args }) => {
        const patch: ProjectPatch = {
          ...(args.name !== undefined ? { name: args.name } : {}),
          ...(args.desc !== undefined ? { description: args.desc } : {}),
        }
        if (Object.keys(patch).length === 0) throw new Error('pass --name and/or --desc')
        console.log(
          await updateProject(clientFor(args), Number(args.id), patch, Boolean(args.json)),
        )
      },
    }),
    rm: defineCommand({
      meta: { name: 'rm', description: 'delete a project' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await removeProject(clientFor(args), Number(args.id), Boolean(args.json)))
      },
    }),
  },
})
