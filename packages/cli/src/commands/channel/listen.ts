import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ChannelMessage, isMessageFor } from '@baton/shared'
import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { common } from '../../util.ts'

// Long messages must NOT be inlined into the live conversation: the harness caps
// how much of a single event it surfaces (~600 chars), so a big body gets clipped.
// listen spills each message to a file and surfaces only a short preview + path;
// the agent Reads the file on demand for the full text.
const PREVIEW = 280

// The eventsource error event carries http status as `.code` (404 = channel gone)
// — surface it so a stale invite is diagnosable.
const describe = (e: unknown): string => {
  const ev = e as { code?: number; message?: string }
  return ev?.code ? `${ev.code}${ev.message ? ` ${ev.message}` : ''}` : String(e)
}

// Shared stream loop, used by both `channel listen` and `channel join --listen`.
// Emits one compact NDJSON line per message (Monitor source); holds the process
// open until killed. The open SSE keeps presence fresh server-side (via ?as=).
export const runListen = async (o: {
  url: string
  channel: string
  from: string
  since: number
  for?: string
}): Promise<void> => {
  const emit = (x: unknown): void => {
    process.stdout.write(`${JSON.stringify(x)}\n`)
  }
  const spillDir = join(tmpdir(), 'channel', o.channel)
  mkdirSync(spillDir, { recursive: true })
  const surface = (m: ChannelMessage): void => {
    const text = typeof m.text === 'string' ? m.text : ''
    const file = join(spillDir, `${m.seq}.txt`)
    writeFileSync(file, text)
    const truncated = text.length > PREVIEW
    emit({
      type: 'channel.message',
      seq: m.seq,
      from: m.from,
      senderKind: m.senderKind,
      to: m.to,
      mine: o.from ? isMessageFor(m, o.from) : undefined,
      ts: m.ts,
      chars: text.length,
      truncated,
      preview: truncated ? `${text.slice(0, PREVIEW)} …` : text,
      // BASE-prefixed urls so the subscribing agent can fetch directly.
      attachments: m.attachments?.length
        ? m.attachments.map(a => ({
            filename: a.filename,
            contentType: a.contentType,
            size: a.size,
            url: `${o.url}${a.url}`,
          }))
        : undefined,
      file,
    })
  }
  const close = channelClient(o.url).listen(o.channel, {
    since: o.since,
    for: o.for,
    as: o.from,
    // Skip our own messages (they echo back over the same channel).
    onMessage: m => {
      if (m.from !== o.from) surface(m)
    },
    onError: e => emit({ type: 'channel.error', error: describe(e) }),
  })
  emit({ type: 'channel.listening', channel: o.channel, from: o.from, url: o.url })
  // Hold open until killed (the background harness owns this process's life).
  await new Promise<void>(resolve => {
    const stop = (): void => {
      close()
      resolve()
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  })
}

export const listenCommand = defineCommand({
  meta: {
    name: 'listen',
    description: 'stream a channel: one JSON line per message (for a background subscriber)',
  },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    from: {
      type: 'string',
      description: 'your name; your own messages skipped, presence kept fresh',
    },
    since: { type: 'string', description: 'replay messages after this seq (default 0 = full)' },
    for: { type: 'string', description: 'only broadcasts + messages addressed to this name' },
    ...common,
  },
  run: async ({ args }) => {
    await runListen({
      url: resolveBaseUrl(args.url),
      channel: args.channel,
      from: args.from ?? '',
      since: args.since ? Number(args.since) : 0,
      for: args.for,
    })
  },
})
