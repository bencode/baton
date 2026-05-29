import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

export const sessionGetCommand = defineCommand({
  meta: { name: 'get', description: 'get a session by int id or name' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const projectId = resolveProjectId(args)
    const handle = await resolveSession(c, projectId, args.session)
    const s = await c.sessions.get(handle.id)
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
