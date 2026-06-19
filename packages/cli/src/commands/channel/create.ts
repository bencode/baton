import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { toJson } from '../../output.ts'
import { common } from '../../util.ts'
import { inviteBlock } from './shared.ts'

export const createCommand = defineCommand({
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
