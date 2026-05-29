import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common } from '../../util.ts'
import { resolveSession } from './shared.ts'

export const sessionGetCommand = defineCommand({
  meta: { name: 'get', description: 'get a session by int id or name' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', required: true, description: 'project id (int)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const projectId = Number(args.project)
    const handle = await resolveSession(c, projectId, args.session)
    const s = await c.sessions.get(handle.id)
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
