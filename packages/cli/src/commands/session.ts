import { defineCommand } from 'citty'
import { sessionChatCommand } from './session/chat.ts'
import { sessionCloseCommand } from './session/close.ts'
import { sessionGetCommand } from './session/get.ts'
import { sessionLsCommand } from './session/ls.ts'
import { sessionNewCommand } from './session/new.ts'
import { sessionRunCommand } from './session/run.ts'

export type { SessionNewInput } from './session/new.ts'
// Re-exported for cli tests (imported directly by feature test files).
export { newSession } from './session/new.ts'
export { parseEnvPairs } from './session/shared.ts'

export const session = defineCommand({
  meta: { name: 'session', description: 'create / chat / inspect agent sessions' },
  subCommands: {
    new: sessionNewCommand,
    chat: sessionChatCommand,
    close: sessionCloseCommand,
    ls: sessionLsCommand,
    get: sessionGetCommand,
    run: sessionRunCommand,
  },
})
