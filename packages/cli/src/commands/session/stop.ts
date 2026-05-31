import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// Stop a session — the worker kills its child but keeps the row + worktree, so
// it can be resumed later. The session goes inactive.
export const sessionStopCommand = defineCommand({
  meta: { name: 'stop', description: 'stop a session (keeps it; resume to restart)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const handle = await resolveSession(c, resolveProjectId(args), args.session)
    const s = await c.sessions.stop(handle.id)
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
