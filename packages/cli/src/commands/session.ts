import { defineCommand } from 'citty'
import { sessionCreateCommand } from './session/create.ts'
import { sessionGetCommand } from './session/get.ts'
import { sessionLsCommand } from './session/ls.ts'
import { sessionRenameCommand } from './session/rename.ts'
import { sessionResumeCommand } from './session/resume.ts'
import { sessionRmCommand } from './session/rm.ts'
import { sessionRunCommand } from './session/run.ts'
import { sessionSendCommand } from './session/send.ts'
import { sessionStopCommand } from './session/stop.ts'

export const session = defineCommand({
  meta: { name: 'session', description: 'create / resume / stop / send to agent sessions' },
  subCommands: {
    create: sessionCreateCommand,
    resume: sessionResumeCommand,
    stop: sessionStopCommand,
    rename: sessionRenameCommand,
    rm: sessionRmCommand,
    send: sessionSendCommand,
    ls: sessionLsCommand,
    get: sessionGetCommand,
    run: sessionRunCommand,
  },
})
