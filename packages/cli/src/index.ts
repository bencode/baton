import { defineCommand, runMain } from 'citty'
import { assignment } from './commands/assignment.ts'
import { project } from './commands/project.ts'
import { requirement } from './commands/requirement.ts'
import { session } from './commands/session.ts'
import { task } from './commands/task.ts'
import { worker } from './commands/worker.ts'
import { workspace } from './commands/workspace.ts'

const main = defineCommand({
  meta: {
    name: 'baton',
    description: 'baton — manage workspaces, projects, requirements, tasks, workers',
  },
  subCommands: { workspace, project, requirement, task, worker, session, assignment },
})

runMain(main)
