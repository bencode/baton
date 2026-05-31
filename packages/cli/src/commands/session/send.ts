import { defineCommand } from 'citty'
import { toJson } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { attachPaths, uploadAttachments } from '../attach.ts'
import { resolveSession } from './shared.ts'

// Post one user_message into a session (fire-and-forget; the reply streams to
// whoever is subscribed — the web UI, or `baton session get`/the SSE stream).
export const sessionSendCommand = defineCommand({
  meta: { name: 'send', description: 'post a chat message into a session (no streaming reply)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    text: { type: 'positional', required: false, description: 'message text' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    attach: {
      type: 'string',
      description: 'file(s) to attach; repeat or comma-separate (e.g. --attach a.png,b.pdf)',
    },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const projectId = resolveProjectId(args)
    const s = await resolveSession(c, projectId, args.session)
    const paths = attachPaths(args.attach)
    const text = args.text ?? ''
    if (text.length === 0 && paths.length === 0)
      throw new Error('nothing to send: provide message text and/or --attach <file>')
    const attachments = paths.length > 0 ? await uploadAttachments(c, s.id, paths) : undefined
    const ev = await c.sessions.sendMessage(s.id, text, attachments)
    if (args.json) console.log(toJson(ev))
    else {
      const note = attachments ? ` +${attachments.length} attachment(s)` : ''
      console.log(`sent (seq ${ev.sequence}) → ${s.name} (#${s.id})${note}: ${text}`)
    }
  },
})
