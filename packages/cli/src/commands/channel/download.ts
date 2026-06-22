import { writeFileSync } from 'node:fs'
import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { common } from '../../util.ts'

// Thin convenience over GET /channels/:id/attachments/:attId — fetch a room
// attachment to a local file. Agents can equally `curl "$BASE/channels/$CH/attachments/$ATT" -o file`
// (the channel id is the capability — no token); this just saves the typing.
export const downloadCommand = defineCommand({
  meta: { name: 'download', description: 'download a channel attachment to a file' },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    att: { type: 'positional', required: true, description: 'attachment id (from a message ref)' },
    out: { type: 'string', alias: 'o', description: 'output file path (default: ./<attId>)' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const res = await channelClient(url).downloadAttachment(args.channel, args.att)
    const out = args.out ?? args.att
    writeFileSync(out, Buffer.from(await res.arrayBuffer()))
    console.log(`saved → ${out}`)
  },
})
