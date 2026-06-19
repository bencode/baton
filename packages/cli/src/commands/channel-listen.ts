import { mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type ChannelMessage, isMessageFor } from '@baton/shared'
import { channelClient } from '../client/channel.ts'

// Long messages must NOT be inlined into the live conversation: the harness caps
// how much of a single event it surfaces (~600 chars), so a big body gets clipped.
// listen spills each message to a file and surfaces only a short preview + path;
// the agent Reads the file on demand for the full text.
const PREVIEW = 280

// The eventsource error event carries http status as `.code` (401 bad token,
// 404 channel gone) — surface it so a stale invite is diagnosable.
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
  token: string
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
      file,
    })
  }
  const close = channelClient(o.url).listen(o.channel, o.token, {
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
