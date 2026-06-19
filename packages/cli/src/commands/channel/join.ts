import type { MemberKind } from '@baton/shared'
import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { toJson } from '../../output.ts'
import { common } from '../../util.ts'
import { runListen } from './listen.ts'
import { renderRoster } from './shared.ts'

export const joinCommand = defineCommand({
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
