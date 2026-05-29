import { defineCommand } from 'citty'
import { sessionDestroyCommand } from './session/destroy.ts'
import { sessionGetCommand } from './session/get.ts'
import { sessionLsCommand } from './session/ls.ts'
import { sessionSendCommand } from './session/send.ts'
import { sessionStartCommand } from './session/start.ts'

export type { SessionNewInput } from './session/provision.ts'
// Re-exported for cli tests (imported directly by feature test files).
export { newSession } from './session/provision.ts'
export { parseEnvPairs } from './session/shared.ts'

export const session = defineCommand({
  meta: { name: 'session', description: 'start / inspect / send / destroy agent sessions' },
  subCommands: {
    start: sessionStartCommand,
    send: sessionSendCommand,
    destroy: sessionDestroyCommand,
    ls: sessionLsCommand,
    get: sessionGetCommand,
  },
})
