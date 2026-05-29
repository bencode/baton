import { defineCommand, runMain } from 'citty'
import { init } from './commands/init.ts'
import { project } from './commands/project.ts'
import { requirement } from './commands/requirement.ts'
import { send } from './commands/send.ts'
import { session } from './commands/session.ts'
import { start } from './commands/start.ts'
import { task } from './commands/task.ts'
import { worker } from './commands/worker.ts'
import { workspace } from './commands/workspace.ts'

const main = defineCommand({
  meta: {
    name: 'baton',
    description: 'baton — start agent sessions; manage projects / requirements / tasks',
  },
  // Order matters: high-level verbs first so --help shows them on top.
  subCommands: {
    init,
    start,
    send,
    workspace,
    project,
    requirement,
    task,
    session,
    worker,
  },
})

runMain(main)
