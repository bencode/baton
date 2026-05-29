import { defineCommand } from 'citty'
import { toJson } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// Primitive form: post one user_message into a session. Higher-level
// `baton send --name X "msg"` (top-level) additionally streams the daemon's
// reply to stdout.
export const sessionSendCommand = defineCommand({
  meta: { name: 'send', description: 'post a chat message into a session (no streaming reply)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    text: { type: 'positional', required: true, description: 'message text' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const projectId = resolveProjectId(args)
    const s = await resolveSession(c, projectId, args.session)
    const ev = await c.sessions.sendMessage(s.id, args.text)
    if (args.json) console.log(toJson(ev))
    else console.log(`sent (seq ${ev.sequence}) → ${s.name} (#${s.id}): ${args.text}`)
  },
})
