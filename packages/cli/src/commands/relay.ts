import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { RelayMessage } from '@baton/shared'
import { defineCommand } from 'citty'
import { relayClient } from '../client/relay.ts'
import { resolveBaseUrl } from '../config.ts'
import { toJson } from '../output.ts'
import { common } from '../util.ts'

// Long messages must NOT be inlined into the live conversation: the harness caps
// how much of a single event it surfaces (~600 chars), so a big body gets clipped
// on the receiver. listen spills each message to a file and surfaces only a short
// preview + path; the agent Reads the file on demand for the full text.
const PREVIEW = 280

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

// Ready-to-paste invite the host hands to a peer. Carries the connection params
// plus the raw CLI fallback so a peer without the `hotline` skill can still join.
const inviteBlock = (url: string, channelId: string, token: string): string =>
  [
    '── Copy everything below to your peer ───────────────────────────',
    "You're invited to a live Claude↔Claude channel. Use the `hotline` skill in",
    'join mode, or run these two commands directly (pick your own NAME):',
    '',
    `  baton relay listen ${channelId} --token ${token} --from NAME --url ${url}`,
    `  baton relay send   ${channelId} --token ${token} --from NAME --text "..." --url ${url}`,
    '',
    `connection: url=${url} channel=${channelId} token=${token}`,
    '─────────────────────────────────────────────────────────────────',
  ].join('\n')

const hostCommand = defineCommand({
  meta: { name: 'host', description: 'open a relay channel and print an invite for a peer' },
  args: {
    name: { type: 'string', description: 'your participant name (default: host)' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const { channelId, token } = await relayClient(url).create()
    if (args.json) {
      console.log(toJson({ channelId, token, url, host: args.name ?? 'host' }))
      return
    }
    console.log(`channel ${channelId} opened\n`)
    console.log(inviteBlock(url, channelId, token))
  },
})

const sendCommand = defineCommand({
  meta: { name: 'send', description: 'post one message to a relay channel' },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    text: { type: 'positional', required: false, description: 'message text (short one-liner)' },
    token: { type: 'string', required: true, description: 'channel token' },
    from: { type: 'string', description: 'your participant name (default: peer)' },
    file: { type: 'string', description: 'read message body from this file (for large content)' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    // Large content goes via --file or stdin to dodge CLI arg limits + shell
    // quoting; the positional text stays for short one-liners.
    let text = args.text
    if (text === undefined && args.file) text = readFileSync(args.file, 'utf8')
    if (text === undefined && !process.stdin.isTTY) text = await readStdin()
    if (text === undefined || text === '')
      throw new Error('nothing to send: provide text, --file <path>, or pipe stdin')
    const msg = await relayClient(url).send(args.channel, args.token, {
      from: args.from ?? 'peer',
      text,
    })
    if (args.json) console.log(toJson(msg))
    else console.log(`sent (seq ${msg.seq})`)
  },
})

const listenCommand = defineCommand({
  meta: {
    name: 'listen',
    description: 'stream a channel: one JSON line per peer message (for a background subscriber)',
  },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    token: { type: 'string', required: true, description: 'channel token' },
    from: {
      type: 'string',
      description: 'your name; messages from this name are skipped (no echo)',
    },
    since: { type: 'string', description: 'replay messages after this seq (default 0 = full)' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const me = args.from ?? ''
    const emit = (o: unknown): void => {
      process.stdout.write(`${JSON.stringify(o)}\n`)
    }
    // Spill full text to disk; surface a compact line. Short messages carry their
    // whole text in `preview` (truncated=false → no read needed); long ones set
    // truncated=true so the agent Reads `file` for the complete body.
    const spillDir = join(tmpdir(), 'hotline', args.channel)
    mkdirSync(spillDir, { recursive: true })
    const surface = (m: RelayMessage): void => {
      const text = typeof m.text === 'string' ? m.text : ''
      const file = join(spillDir, `${m.seq}.txt`)
      writeFileSync(file, text)
      const truncated = text.length > PREVIEW
      emit({
        type: 'relay.message',
        seq: m.seq,
        from: m.from,
        ts: m.ts,
        chars: text.length,
        truncated,
        preview: truncated ? `${text.slice(0, PREVIEW)} …` : text,
        file,
      })
    }
    // The eventsource error event carries http status as `.code` (e.g. 401 bad
    // token, 404 channel gone) — surface it so a stale invite is diagnosable.
    const describe = (e: unknown): string => {
      const ev = e as { code?: number; message?: string }
      return ev?.code ? `${ev.code}${ev.message ? ` ${ev.message}` : ''}` : String(e)
    }
    const close = relayClient(url).listen(args.channel, args.token, {
      since: args.since ? Number(args.since) : 0,
      // Skip our own messages (they come back over the same channel).
      onMessage: m => {
        if (m.from !== me) surface(m)
      },
      onError: e => emit({ type: 'relay.error', error: describe(e) }),
    })
    emit({ type: 'relay.listening', channel: args.channel, from: me, url })
    // Hold the process open until killed (the background harness owns its life).
    await new Promise<void>(resolve => {
      const stop = (): void => {
        close()
        resolve()
      }
      process.on('SIGINT', stop)
      process.on('SIGTERM', stop)
    })
  },
})

export const relay = defineCommand({
  meta: { name: 'relay', description: 'Claude↔Claude live channel: host / listen / send' },
  subCommands: { host: hostCommand, listen: listenCommand, send: sendCommand },
})
