import { defineCommand } from 'citty'
import { relayClient } from '../client/relay.ts'
import { resolveBaseUrl } from '../config.ts'
import { toJson } from '../output.ts'
import { common } from '../util.ts'

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
    text: { type: 'positional', required: true, description: 'message text' },
    token: { type: 'string', required: true, description: 'channel token' },
    from: { type: 'string', description: 'your participant name (default: peer)' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const msg = await relayClient(url).send(args.channel, args.token, {
      from: args.from ?? 'peer',
      text: args.text,
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
        if (m.from !== me) emit({ type: 'relay.message', ...m })
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
