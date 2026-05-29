import type { SessionEvent } from '@baton/shared'
import { defineCommand } from 'citty'
import { EventSource } from 'eventsource'
import { resolveBaseUrl } from '../config.ts'
import { renderEvent } from '../render-events.ts'
import { clientFor, common, resolveProjectId } from '../util.ts'
import { attachPaths, uploadAttachments } from './attach.ts'

// Top-level `baton send` — post a message into a session AND stream the
// daemon's reply to stdout. Exits when the turn completes/errors. The lower
// `baton session send` form is fire-and-return (no streaming); this one is
// what daily users will reach for.
export const send = defineCommand({
  meta: { name: 'send', description: 'post a message into a session and stream the reply' },
  args: {
    name: { type: 'string', required: true, description: 'session name' },
    text: { type: 'positional', required: false, description: 'message text' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    attach: {
      type: 'string',
      description: 'file(s) to attach; repeat or comma-separate (e.g. --attach a.png,b.pdf)',
    },
    follow: {
      type: 'boolean',
      default: true,
      description: 'stream the reply until the turn ends (use --no-follow to just post and exit)',
    },
    ...common,
  },
  run: async ({ args }) => {
    const server = resolveBaseUrl(args.url)
    const c = clientFor(args)
    const projectId = resolveProjectId(args)
    const found = await c.sessions.findByName(projectId, args.name)
    if (!found)
      throw new Error(
        `no session named '${args.name}' in project ${projectId}. ` +
          `run \`baton start --name ${args.name}\` to create one.`,
      )

    const paths = attachPaths(args.attach)
    const text = args.text ?? ''
    if (text.length === 0 && paths.length === 0)
      throw new Error('nothing to send: provide message text and/or --attach <file>')
    const attachments = paths.length > 0 ? await uploadAttachments(c, found.id, paths) : undefined
    const ev = await c.sessions.sendMessage(found.id, text, attachments)
    const note = attachments ? ` +${attachments.length} attachment(s)` : ''
    console.log(`→ sent (seq ${ev.sequence}) to ${args.name} (#${found.id})${note}`)

    if (!args.follow) return

    // Skip subscribing if no daemon is processing this session — otherwise the
    // user sits waiting for events that never come. The daemon seeds liveness
    // on start (immediate ping), so a quick send-after-start should still see
    // alive=true.
    const view = (await c.sessions.get(found.id)) as typeof found & { alive?: boolean }
    if (view.alive === false) {
      console.log(
        '[!] no live daemon for this session — message is queued.\n' +
          `    run \`baton start --name ${args.name}\` in another window, then re-send.`,
      )
      return
    }

    await streamReply(server, found.id, ev.sequence)
  },
})

// Subscribe to the session's SSE stream, render every event past `afterSeq`,
// and resolve when the renderer signals a turn boundary.
const streamReply = (server: string, sessionId: number, afterSeq: number): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const es = new EventSource(`${server}/sessions/${sessionId}/stream`)
    let settled = false
    const finish = (err?: Error): void => {
      if (settled) return
      settled = true
      es.close()
      if (err) reject(err)
      else resolve()
    }
    es.onmessage = e => {
      try {
        const event = JSON.parse(e.data) as SessionEvent
        if (event.sequence <= afterSeq) return
        const { done, ok } = renderEvent(event)
        if (done) finish(ok ? undefined : new Error('turn failed'))
      } catch {
        // skip malformed payloads
      }
    }
    es.onerror = () => {
      // Single transient blip shouldn't kill us; EventSource auto-reconnects.
      // We only fail if no event ever arrives — caller may set a timeout.
    }
    const onSig = () => finish()
    process.once('SIGINT', onSig)
    process.once('SIGTERM', onSig)
  })
