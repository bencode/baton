import { defineCommand } from 'citty'
import { channelClient } from '../../client/channel.ts'
import { resolveBaseUrl } from '../../config.ts'
import { toJson } from '../../output.ts'
import { common } from '../../util.ts'
import { renderRoster } from './shared.ts'

// Read-only "what is this room / how do I use it" commands, plus `update` for the
// topic. Kept apart from the create/join/send/listen/close verbs.
export const aboutCommand = defineCommand({
  meta: { name: 'about', description: "show a channel's manifest (description + online roster)" },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    token: { type: 'string', required: true, description: 'channel token' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const m = await channelClient(url).manifest(args.channel, args.token)
    if (args.json) {
      console.log(toJson(m))
      return
    }
    console.log(`${m.title ?? '(untitled)'}  [${m.id}]`)
    if (m.description) console.log(m.description)
    console.log(`\nonline (${m.members.length}):\n${renderRoster(m.members)}`)
    console.log(`\nprotocol: curl -sS "${url}${m.help}"`)
  },
})

export const helpCommand = defineCommand({
  meta: { name: 'help', description: 'print the channel protocol doc (no token needed)' },
  args: { ...common },
  run: async ({ args }) => {
    console.log(await channelClient(resolveBaseUrl(args.url)).help())
  },
})

export const membersCommand = defineCommand({
  meta: { name: 'members', description: "list the channel's online roster" },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    token: { type: 'string', required: true, description: 'channel token' },
    ...common,
  },
  run: async ({ args }) => {
    const url = resolveBaseUrl(args.url)
    const members = await channelClient(url).members(args.channel, args.token)
    console.log(args.json ? toJson(members) : renderRoster(members))
  },
})

export const updateCommand = defineCommand({
  meta: { name: 'update', description: "update a channel's title / description (topic + rules)" },
  args: {
    channel: { type: 'positional', required: true, description: 'channel id' },
    token: { type: 'string', required: true, description: 'channel token' },
    title: { type: 'string', description: 'new title' },
    desc: { type: 'string', description: 'new description (purpose / topic / rules)' },
    ...common,
  },
  run: async ({ args }) => {
    if (args.title === undefined && args.desc === undefined)
      throw new Error('nothing to update: pass --title and/or --desc')
    const url = resolveBaseUrl(args.url)
    const ch = await channelClient(url).update(args.channel, args.token, {
      title: args.title,
      description: args.desc,
    })
    console.log(args.json ? toJson(ch) : `updated ${ch.id}${ch.title ? ` — ${ch.title}` : ''}`)
  },
})
