import { defineCommand, runMain } from 'citty'
import { project } from './commands/project.ts'
import { requirement } from './commands/requirement.ts'
import { task } from './commands/task.ts'
import { workspace } from './commands/workspace.ts'

const main = defineCommand({
  meta: { name: 'baton', description: 'baton — manage workspaces, projects, requirements, tasks' },
  subCommands: { workspace, project, requirement, task },
})

runMain(main)
