import { defineCommand } from 'citty'
import { toJson } from '../../output.ts'
import { clientFor, common } from '../../util.ts'
import { resolveSession } from './shared.ts'

// Primary user-side communication channel: send one chat message into a
// running session's stream. The daemon's drain loop picks it up and runs a
// turn. Equivalent to typing in the web UI's composer.
export const sessionChatCommand = defineCommand({
  meta: { name: 'chat', description: 'send a chat message into a session (by int id or name)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    text: { type: 'positional', required: true, description: 'message text' },
    project: { type: 'string', required: true, description: 'project id (int)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const projectId = Number(args.project)
    const s = await resolveSession(c, projectId, args.session)
    const ev = await c.sessions.sendMessage(s.id, args.text)
    if (args.json) console.log(toJson(ev))
    else console.log(`sent (seq ${ev.sequence}) → ${s.name} (#${s.id}): ${args.text}`)
  },
})
