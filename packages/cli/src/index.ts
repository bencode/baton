import { defineCommand, runMain } from 'citty'
import { init } from './commands/init.ts'
import { project } from './commands/project.ts'
import { requirement } from './commands/requirement.ts'
import { send } from './commands/send.ts'
import { session } from './commands/session.ts'
import { task } from './commands/task.ts'
import { worker } from './commands/worker.ts'
import { workspace } from './commands/workspace.ts'

const main = defineCommand({
  meta: {
    name: 'baton',
    description: 'baton — run a worker daemon; manage projects / requirements / tasks / sessions',
  },
  // Order matters: high-level verbs first so --help shows them on top.
  subCommands: {
    init,
    worker,
    session,
    send,
    workspace,
    project,
    requirement,
    task,
  },
})

runMain(main)
