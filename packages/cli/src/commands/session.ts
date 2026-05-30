import { defineCommand } from 'citty'
import { sessionGetCommand } from './session/get.ts'
import { sessionLsCommand } from './session/ls.ts'
import { sessionRunCommand } from './session/run.ts'
import { sessionSendCommand } from './session/send.ts'

// Re-exported for cli tests / other commands.
export { parseEnvPairs } from './session/shared.ts'

export const session = defineCommand({
  meta: { name: 'session', description: 'run / inspect / send to agent sessions' },
  subCommands: {
    run: sessionRunCommand,
    send: sessionSendCommand,
    ls: sessionLsCommand,
    get: sessionGetCommand,
  },
})
