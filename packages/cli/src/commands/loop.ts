import { defineCommand } from 'citty'
import { loopCreateCommand } from './loop/create.ts'
import { loopDisableCommand } from './loop/disable.ts'
import { loopEnableCommand } from './loop/enable.ts'
import { loopGetCommand } from './loop/get.ts'
import { loopLsCommand } from './loop/ls.ts'
import { loopRmCommand } from './loop/rm.ts'
import { loopSetCommand } from './loop/set.ts'

export const loop = defineCommand({
  meta: { name: 'loop', description: 'recurring scheduled messages that wake a session' },
  subCommands: {
    create: loopCreateCommand,
    ls: loopLsCommand,
    get: loopGetCommand,
    set: loopSetCommand,
    enable: loopEnableCommand,
    disable: loopDisableCommand,
    rm: loopRmCommand,
  },
})
