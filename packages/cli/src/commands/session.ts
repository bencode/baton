import { defineCommand } from 'citty'
import { sessionCloseCommand } from './session/close.ts'
import { sessionGetCommand } from './session/get.ts'
import { sessionLsCommand } from './session/ls.ts'
import { sessionNewCommand } from './session/new.ts'
import { sessionRunCommand } from './session/run.ts'
import { sessionSendCommand } from './session/send.ts'

export type { SessionNewInput } from './session/new.ts'
// Re-exported for cli tests (imported directly by feature test files).
export { newSession } from './session/new.ts'
export { parseEnvPairs } from './session/shared.ts'

export const session = defineCommand({
  meta: { name: 'session', description: 'create / inspect / send / run agent sessions' },
  subCommands: {
    new: sessionNewCommand,
    send: sessionSendCommand,
    close: sessionCloseCommand,
    ls: sessionLsCommand,
    get: sessionGetCommand,
    run: sessionRunCommand,
  },
})
