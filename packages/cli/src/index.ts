import { defineCommand, runMain } from 'citty'
import { init } from './commands/init.ts'
import { project } from './commands/project.ts'
import { requirement } from './commands/requirement.ts'
import { session } from './commands/session.ts'
import { task } from './commands/task.ts'
import { worker } from './commands/worker.ts'
import { workspace } from './commands/workspace.ts'

const main = defineCommand({
  meta: {
    name: 'baton',
    description: 'baton — manage workspaces / projects / requirements / tasks / sessions / workers',
  },
  subCommands: { init, workspace, project, requirement, task, session, worker },
})

runMain(main)
