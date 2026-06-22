import { openAsBlob, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import type { Attachment } from '@baton/shared'
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
    from: { type: 'string', description: 'your participant name (default: peer)' },
    to: {
      type: 'string',
      description: 'direct it at these names (comma-separated); omit = broadcast',
    },
    file: { type: 'string', description: 'read message body from this file (for large content)' },
    attach: {
      type: 'string',
      description: 'attach file(s) (comma-separated paths); uploaded + carried on the message',
    },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const client = channelClient(url)
    // Large content goes via --file or stdin to dodge CLI arg limits + shell quoting.
    let text = args.text
    if (text === undefined && args.file) text = readFileSync(args.file, 'utf8')
    if (text === undefined && !process.stdin.isTTY) text = await readStdin()
    // Upload each attachment (streamed from disk); they ride the message as
    // structured refs (not text) so peers render/download them by url.
    const attachments: Attachment[] = []
    for (const path of attachPaths(args.attach)) {
      attachments.push(
        await client.uploadAttachment(args.channel, {
          filename: basename(path),
          contentType: contentTypeForPath(path),
          body: await openAsBlob(path, { type: contentTypeForPath(path) }),
        }),
      )
    }
    if (!text && attachments.length === 0)
      throw new Error(
        'nothing to send: provide text, --file <path>, --attach <file>, or pipe stdin',
      )
    const msg = await client.send(args.channel, {
      from: args.from ?? 'peer',
      text: text ?? '',
      to: splitCsv(args.to),
      attachments: attachments.length ? attachments : undefined,
    })
    if (args.json) console.log(toJson(msg))
    else console.log(`sent (seq ${msg.seq})`)
  },
})
