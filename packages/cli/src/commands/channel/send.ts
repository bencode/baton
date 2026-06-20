import { openAsBlob, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { contentTypeForPath } from '../../mime.ts'
import { toJson } from '../../output.ts'
import { common, splitCsv } from '../../util.ts'
import { attachPaths } from '../attach.ts'
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
    attach: { type: 'string', description: 'attach file(s) (comma-separated paths); uploads + cites links' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const client = channelClient(url)
    // Large content goes via --file or stdin to dodge CLI arg limits + shell quoting.
    let text = args.text
    if (text === undefined && args.file) text = readFileSync(args.file, 'utf8')
    if (text === undefined && !process.stdin.isTTY) text = await readStdin()
    // Upload each attachment (streamed from disk), then cite its download link in
    // the body so peers can fetch it.
    const links: string[] = []
    for (const path of attachPaths(args.attach)) {
      const att = await client.uploadAttachment(args.channel, args.token, {
        filename: basename(path),
        contentType: contentTypeForPath(path),
        body: await openAsBlob(path, { type: contentTypeForPath(path) }),
      })
      links.push(`[${att.filename}] ${url}${att.url}`)
    }
    const body = [text ?? '', ...links].filter(Boolean).join('\n')
    if (body === '')
      throw new Error('nothing to send: provide text, --file <path>, --attach <file>, or pipe stdin')
    const msg = await client.send(args.channel, args.token, {
      from: args.from ?? 'peer',
      text: body,
      to: splitCsv(args.to),
    })
    if (args.json) console.log(toJson(msg))
    else console.log(`sent (seq ${msg.seq})`)
  },
})
