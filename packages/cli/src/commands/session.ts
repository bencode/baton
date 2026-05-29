import { defineCommand } from 'citty'
import { sessionCloseCommand } from './session/close.ts'
import { sessionGetCommand } from './session/get.ts'
import { sessionLsCommand } from './session/ls.ts'
import { sessionNewCommand } from './session/new.ts'
import { sessionRunCommand } from './session/run.ts'
import { sessionSayCommand } from './session/say.ts'

// Re-exported for cli.test.ts (tests import these helpers directly).
export { newSession } from './session/new.ts'
export type { SessionNewInput } from './session/new.ts'
export { parseEnvPairs } from './session/shared.ts'

export const session = defineCommand({
  meta: { name: 'session', description: 'create / chat / inspect Claude Code sessions' },
  subCommands: {
    new: sessionNewCommand,
    say: sessionSayCommand,
    close: sessionCloseCommand,
    ls: sessionLsCommand,
    get: sessionGetCommand,
    run: sessionRunCommand,
  },
})
