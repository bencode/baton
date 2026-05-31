import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// Rename a session — sets a human-chosen name and locks it, so a pending
// auto-title never overrides it. Collaboration metadata only; the running
// child (if any) is unaffected.
export const sessionRenameCommand = defineCommand({
  meta: { name: 'rename', description: 'rename a session (locks the name against auto-title)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    name: { type: 'positional', required: true, description: 'new name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const handle = await resolveSession(c, resolveProjectId(args), args.session)
    const s = await c.sessions.rename(handle.id, args.name)
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
