import { defineCommand } from 'citty'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// Delete a session: the worker tears down its child + worktree, the row is dropped.
export const sessionRmCommand = defineCommand({
  meta: { name: 'rm', description: 'delete a session (irreversible; removes its worktree)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    confirm: { type: 'boolean', description: 'actually perform the deletion' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const handle = await resolveSession(c, resolveProjectId(args), args.session)
    if (!args.confirm) {
      console.log(`[dry-run] would delete session ${handle.name} (#${handle.id}) + its worktree`)
      console.log('re-run with --confirm to proceed.')
      return
    }
    await c.sessions.destroy(handle.id)
    console.log(`deleted session ${handle.name} (#${handle.id})`)
  },
})
