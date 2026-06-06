import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// Clear a session's context — reset the claude conversation (fresh agentSessionId)
// but keep the session, worktree, and url. The running child is restarted with an
// empty conversation; code in the worktree is preserved.
export const sessionClearCommand = defineCommand({
  meta: {
    name: 'clear',
    description: 'reset the conversation context (keeps the session + worktree)',
  },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const handle = await resolveSession(c, resolveProjectId(args), args.session)
    const s = await c.sessions.clear(handle.id)
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
