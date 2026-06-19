import { defineCommand } from 'citty'
import { closeCommand } from './channel/close.ts'
import { createCommand } from './channel/create.ts'
import { aboutCommand, helpCommand, membersCommand, updateCommand } from './channel/info.ts'
import { joinCommand } from './channel/join.ts'
import { listenCommand } from './channel/listen.ts'
import { readCommand } from './channel/read.ts'
import { sendCommand } from './channel/send.ts'

export const channel = defineCommand({
  meta: {
    name: 'channel',
    description:
      'multi-agent chat room: create / about / update / help / join / members / send / read / listen / close',
  },
  subCommands: {
    create: createCommand,
    about: aboutCommand,
    update: updateCommand,
    help: helpCommand,
    join: joinCommand,
    members: membersCommand,
    send: sendCommand,
    read: readCommand,
    listen: listenCommand,
    close: closeCommand,
  },
})
