import type { Id } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { fmtWorkspace, removed, renderList, renderOne } from '../output.ts'
import { clientFor, common } from '../util.ts'

export const createWorkspace = (c: ApiClient, name: string, json: boolean): Promise<string> =>
  c.workspaces.create({ name }).then(w => renderOne(w, fmtWorkspace, json))
export const listWorkspaces = (c: ApiClient, json: boolean): Promise<string> =>
  c.workspaces.list().then(ws => renderList(ws, fmtWorkspace, json))
export const getWorkspace = (c: ApiClient, id: Id, json: boolean): Promise<string> =>
  c.workspaces.get(id).then(w => renderOne(w, fmtWorkspace, json))
export const removeWorkspace = (c: ApiClient, id: Id, json: boolean): Promise<string> =>
  c.workspaces.remove(id).then(() => removed('workspace', id, json))

export const workspace = defineCommand({
  meta: { name: 'workspace', description: 'manage workspaces' },
  subCommands: {
    create: defineCommand({
      meta: { name: 'create', description: 'create a workspace' },
      args: {
        name: { type: 'positional', required: true, description: 'workspace name' },
        ...common,
      },
      run: async ({ args }) => {
        console.log(await createWorkspace(clientFor(args), args.name, Boolean(args.json)))
      },
    }),
    ls: defineCommand({
      meta: { name: 'ls', description: 'list workspaces' },
      args: { ...common },
      run: async ({ args }) => {
        console.log(await listWorkspaces(clientFor(args), Boolean(args.json)))
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a workspace' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await getWorkspace(clientFor(args), Number(args.id), Boolean(args.json)))
      },
    }),
    rm: defineCommand({
      meta: { name: 'rm', description: 'delete a workspace' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await removeWorkspace(clientFor(args), Number(args.id), Boolean(args.json)))
      },
    }),
  },
})
