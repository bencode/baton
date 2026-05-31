import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// Resume (re-start) an existing, inactive session — the worker respawns its child.
export const sessionResumeCommand = defineCommand({
  meta: { name: 'resume', description: 'resume (re-start) an existing session' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const handle = await resolveSession(c, resolveProjectId(args), args.session)
    const s = await c.sessions.resume(handle.id)
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
