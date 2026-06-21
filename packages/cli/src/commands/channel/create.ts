import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { toJson } from '../../output.ts'
import { common, resolveBearer, resolveWorkspaceId } from '../../util.ts'
import { inviteBlock } from './shared.ts'

export const createCommand = defineCommand({
  meta: {
    name: 'create',
    description: 'open a channel (chat room) in a workspace and print an invite',
  },
  args: {
    workspace: {
      type: 'string',
      description: 'owning workspace id (or the cwd .baton.json workspace)',
    },
    name: { type: 'string', description: 'room title (optional)' },
    desc: {
      type: 'string',
      description: 'room self-description: purpose / topic / how to participate',
    },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const workspaceId = resolveWorkspaceId(args)
    const { channelId, token } = await channelClient(url).create(
      workspaceId,
      args.name,
      args.desc,
      resolveBearer(),
    )
    if (args.json) {
      console.log(
        toJson({ channelId, token, url, workspaceId, name: args.name, description: args.desc }),
      )
      return
    }
    console.log(`channel ${channelId} opened in workspace ${workspaceId}\n`)
    console.log(inviteBlock(url, channelId, token))
  },
})
