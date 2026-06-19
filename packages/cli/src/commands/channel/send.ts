import { readFileSync } from 'node:fs'
import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { toJson } from '../../output.ts'
import { common, splitCsv } from '../../util.ts'
import { readStdin } from './shared.ts'

export const sendCommand = defineCommand({
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
