import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { toJson } from '../../output.ts'
import { common } from '../../util.ts'

export const closeCommand = defineCommand({
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
