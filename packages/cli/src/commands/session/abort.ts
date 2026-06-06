import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// Interrupt the in-flight turn — like pressing Esc in Claude Code. Aborts the
// current SDK query but keeps the session, worktree, and conversation; the next
// message resumes. No-op when no turn is running.
export const sessionAbortCommand = defineCommand({
  meta: {
    name: 'abort',
    description: 'interrupt the in-flight turn (like Esc); keeps the session',
  },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const handle = await resolveSession(c, resolveProjectId(args), args.session)
    const s = await c.sessions.abort(handle.id)
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
