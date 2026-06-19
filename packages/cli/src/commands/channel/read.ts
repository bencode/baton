import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { toJson } from '../../output.ts'
import { common } from '../../util.ts'

export const readCommand = defineCommand({
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
