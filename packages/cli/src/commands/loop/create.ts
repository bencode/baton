import { defineCommand } from 'citty'
import { fmtLoop, renderOne } from '../../output.ts'
import { clientFor, common, parseDuration, resolveProjectId } from '../../util.ts'
import { resolveSession } from '../session/shared.ts'

// Create a recurring scheduled wake-up on a session. The server fires it every
// `--every` interval, sending `--message` to the session (auto-resumes the
// worker). First beat is one interval out — never fires on creation.
export const loopCreateCommand = defineCommand({
  meta: { name: 'create', description: 'create a recurring scheduled message on a session' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    message: {
      type: 'string',
      required: true,
      description: 'message sent to the session each beat',
    },
    every: {
      type: 'string',
      required: true,
      description: 'interval: 90s / 30m / 2h / 1d (min 30s)',
    },
    name: { type: 'string', description: 'optional label' },
    off: { type: 'boolean', description: 'create paused (disabled)' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const session = await resolveSession(c, resolveProjectId(args), args.session)
    const loop = await c.loops.create(session.id, {
      message: args.message,
      intervalSec: parseDuration(args.every),
      name: args.name,
      enabled: !args.off,
    })
    console.log(renderOne(loop, fmtLoop, Boolean(args.json)))
  },
})
