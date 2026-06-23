import { defineCommand, runMain } from 'citty'
import { channel } from './commands/channel.ts'
import { init } from './commands/init.ts'
import { loop } from './commands/loop.ts'
import { project } from './commands/project.ts'
import { relay } from './commands/relay.ts'
import { requirement } from './commands/requirement.ts'
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
    loop,
    relay,
    channel,
    workspace,
    project,
    requirement,
    task,
  },
})

runMain(main)
