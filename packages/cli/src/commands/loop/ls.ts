import { defineCommand } from 'citty'
import { fmtLoop, renderList } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from '../session/shared.ts'

export const loopLsCommand = defineCommand({
  meta: { name: 'ls', description: "list a session's loops" },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const session = await resolveSession(c, resolveProjectId(args), args.session)
    const loops = await c.loops.listBySession(session.id)
    console.log(renderList(loops, fmtLoop, Boolean(args.json)))
  },
})
