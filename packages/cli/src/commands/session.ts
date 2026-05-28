import type { Id } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { fmtSession, renderList, renderOne } from '../output.ts'
import { clientFor, common } from '../util.ts'

export const listSessions = (c: ApiClient, projectId: Id, json: boolean): Promise<string> =>
  c.sessions.listByProject(projectId).then(ss => renderList(ss, fmtSession, json))

export const getSession = (c: ApiClient, id: Id, json: boolean): Promise<string> =>
  c.sessions.get(id).then(s => renderOne(s, fmtSession, json))

export const session = defineCommand({
  meta: { name: 'session', description: 'inspect worker sessions' },
  subCommands: {
    ls: defineCommand({
      meta: { name: 'ls', description: 'list sessions in a project' },
      args: {
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        console.log(await listSessions(clientFor(args), Number(args.project), Boolean(args.json)))
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a session by id (int)' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await getSession(clientFor(args), Number(args.id), Boolean(args.json)))
      },
    }),
  },
})
