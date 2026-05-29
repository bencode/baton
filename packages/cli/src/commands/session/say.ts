import { defineCommand } from 'citty'
import { toJson } from '../../output.ts'
import { clientFor, common } from '../../util.ts'
import { resolveSession } from './shared.ts'

export const sessionSayCommand = defineCommand({
  meta: { name: 'say', description: 'send a chat message into a session (by int id or name)' },
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
