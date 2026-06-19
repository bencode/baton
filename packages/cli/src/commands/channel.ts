import { readFileSync } from 'node:fs'
import type { MemberKind } from '@baton/shared'
import { defineCommand } from 'citty'
import { channelClient } from '../client/channel.ts'
import { resolveBaseUrl } from '../config.ts'
import { toJson } from '../output.ts'
import { common, splitCsv } from '../util.ts'
import {
  aboutCommand,
  helpCommand,
  membersCommand,
  renderRoster,
  updateCommand,
} from './channel-info.ts'
import { runListen } from './channel-listen.ts'

const readStdin = async (): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const c of process.stdin) chunks.push(c as Buffer)
  return Buffer.concat(chunks).toString('utf8')
}

// Ready-to-share invite. The channel is self-describing, so this stays tiny: one
// curl shows the room, one curl returns the full protocol. No big pasted guide.
const inviteBlock = (url: string, channelId: string, token: string): string =>
  [
    '── Share this to invite anyone into the room ─────────────────────',
    "You're invited to a baton channel. Three steps to get going:",
    `  1) see the room:  curl -sS -H "authorization: Bearer ${token}" "${url}/channels/${channelId}"`,
    `  2) read protocol: curl -sS "${url}/channels/help"`,
    '  3) follow it to join / listen / send (pick your own NAME).',
    '',
    `connection: url=${url} channel=${channelId} token=${token}`,
    '──────────────────────────────────────────────────────────────────',
  ].join('\n')

const createCommand = defineCommand({
  meta: { name: 'create', description: 'open a channel (chat room) and print an invite' },
  args: {
    name: { type: 'string', description: 'room title (optional)' },
    desc: { type: 'string', description: 'room self-description: purpose / topic / how to participate' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const { channelId, token } = await channelClient(url).create(args.name, args.desc)
    if (args.json) {
      console.log(toJson({ channelId, token, url, name: args.name, description: args.desc }))
      return
    }
    console.log(`channel ${channelId} opened\n`)
    console.log(inviteBlock(url, channelId, token))
  },
})

const joinCommand = defineCommand({
  meta: { name: 'join', description: 'join a channel (register presence); --listen to also stream' },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    token: { type: 'string', required: true, description: 'channel token' },
    from: { type: 'string', required: true, description: 'your participant name' },
    kind: { type: 'string', description: 'your kind: agent (default) | human' },
    listen: { type: 'boolean', description: 'after joining, stream messages (background subscriber)' },
    since: { type: 'string', description: 'with --listen: replay after this seq (default 0)' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const kind: MemberKind = args.kind === 'human' ? 'human' : 'agent'
    const members = await channelClient(url).join(args.channel, args.token, args.from, kind)
    if (!args.listen) {
      if (args.json) console.log(toJson({ joined: args.from, members }))
      else console.log(`joined as ${args.from} (${members.length} online)\n${renderRoster(members)}`)
      return
    }
    // --listen: fall through to the stream loop — the open SSE keeps presence fresh.
    await runListen({
      url,
      channel: args.channel,
      token: args.token,
      from: args.from,
      since: args.since ? Number(args.since) : 0,
    })
  },
})

const sendCommand = defineCommand({
  meta: { name: 'send', description: 'post one message to a channel' },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    text: { type: 'positional', required: false, description: 'message text (short one-liner)' },
    token: { type: 'string', required: true, description: 'channel token' },
    from: { type: 'string', description: 'your participant name (default: peer)' },
    to: { type: 'string', description: 'direct it at these names (comma-separated); omit = broadcast' },
    file: { type: 'string', description: 'read message body from this file (for large content)' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    // Large content goes via --file or stdin to dodge CLI arg limits + shell quoting.
    let text = args.text
    if (text === undefined && args.file) text = readFileSync(args.file, 'utf8')
    if (text === undefined && !process.stdin.isTTY) text = await readStdin()
    if (text === undefined || text === '')
      throw new Error('nothing to send: provide text, --file <path>, or pipe stdin')
    const msg = await channelClient(url).send(args.channel, args.token, {
      from: args.from ?? 'peer',
      text,
      to: splitCsv(args.to),
    })
    if (args.json) console.log(toJson(msg))
    else console.log(`sent (seq ${msg.seq})`)
  },
})

const readCommand = defineCommand({
  meta: { name: 'read', description: 'poll channel messages once (curl-style, since a cursor)' },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    token: { type: 'string', required: true, description: 'channel token' },
    since: { type: 'string', description: 'only messages after this seq (default 0)' },
    from: { type: 'string', description: 'skip messages from this name (no echo)' },
    for: { type: 'string', description: 'only broadcasts + messages addressed to this name' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const msgs = await channelClient(url).read(args.channel, args.token, {
      since: args.since ? Number(args.since) : 0,
      for: args.for,
    })
    const out = args.from ? msgs.filter(m => m.from !== args.from) : msgs
    if (args.json) console.log(toJson(out))
    else console.log(out.length ? out.map(m => `${m.seq}  ${m.from}  ${m.text}`).join('\n') : '(none)')
  },
})

const listenCommand = defineCommand({
  meta: {
    name: 'listen',
    description: 'stream a channel: one JSON line per message (for a background subscriber)',
  },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    token: { type: 'string', required: true, description: 'channel token' },
    from: { type: 'string', description: 'your name; your own messages skipped, presence kept fresh' },
    since: { type: 'string', description: 'replay messages after this seq (default 0 = full)' },
    for: { type: 'string', description: 'only broadcasts + messages addressed to this name' },
    ...common,
  },
  run: async ({ args }) => {
    await runListen({
      url: resolveBaseUrl(args.url),
      channel: args.channel,
      token: args.token,
      from: args.from ?? '',
      since: args.since ? Number(args.since) : 0,
      for: args.for,
    })
  },
})

const closeCommand = defineCommand({
  meta: { name: 'close', description: 'delete a channel (removes the room and all its messages)' },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    token: { type: 'string', required: true, description: 'channel token' },
    ...common,
  },
  run: async ({ args }) => {
    await channelClient(resolveBaseUrl(args.url)).destroy(args.channel, args.token)
    console.log(args.json ? toJson({ ok: true, deleted: args.channel }) : `closed ${args.channel}`)
  },
})

export const channel = defineCommand({
  meta: {
    name: 'channel',
    description:
      'multi-agent chat room: create / about / update / help / join / members / send / read / listen / close',
  },
  subCommands: {
    create: createCommand,
    about: aboutCommand,
    update: updateCommand,
    help: helpCommand,
    join: joinCommand,
    members: membersCommand,
    send: sendCommand,
    read: readCommand,
    listen: listenCommand,
    close: closeCommand,
  },
})
