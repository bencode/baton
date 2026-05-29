import { existsSync } from 'node:fs'
import { join } from 'node:path'
import * as readline from 'node:readline/promises'
import type { Project, Workspace } from '@baton/shared'
import { defineCommand } from 'citty'
import { createClient } from '../client.ts'
import { resolveBaseUrl } from '../config.ts'
import {
  PROJECT_CONFIG_NAME,
  type ProjectConfig,
  saveProjectConfig,
} from '../project-config.ts'
import { common } from '../util.ts'

type WithIdName = { id: number; name: string }

// Print a numbered list, prompt for choice, return the picked item.
const promptPick = async <T extends WithIdName>(label: string, items: T[]): Promise<T> => {
  if (items.length === 0) throw new Error(`no ${label}s found on server`)
  console.log(`${label}s:`)
  items.forEach((it, i) => console.log(`  [${i + 1}] #${it.id}  ${it.name}`))
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    const ans = (await rl.question(`pick a ${label} (1-${items.length}): `)).trim()
    const idx = Number(ans) - 1
    const picked = items[idx]
    if (!picked) throw new Error(`invalid choice: ${ans}`)
    return picked
  } finally {
    rl.close()
  }
}

export const init = defineCommand({
  meta: {
    name: 'init',
    description: `write ${PROJECT_CONFIG_NAME} in the current directory (commit it; team shares it)`,
  },
  args: {
    workspace: { type: 'string', description: 'workspace id (skip prompt)' },
    project: { type: 'string', description: 'project id (skip prompt)' },
    force: { type: 'boolean', description: `overwrite existing ${PROJECT_CONFIG_NAME}` },
    ...common,
  },
  run: async ({ args }) => {
    const server = resolveBaseUrl(args.url)
    const cfgPath = join(process.cwd(), PROJECT_CONFIG_NAME)
    if (existsSync(cfgPath) && !args.force)
      throw new Error(`${PROJECT_CONFIG_NAME} already exists. use --force to overwrite.`)
    const c = createClient(server)

    let project: Project
    let workspace: Workspace
    if (args.project) {
      project = await c.projects.get(Number(args.project))
      workspace = await c.workspaces.get(project.workspaceId)
    } else {
      const wsList = await c.workspaces.list()
      workspace = args.workspace
        ? (wsList.find(w => w.id === Number(args.workspace)) ??
          (() => {
            throw new Error(`workspace ${args.workspace} not found`)
          })())
        : await promptPick('workspace', wsList)
      const projects = await c.projects.listByWorkspace(workspace.id)
      project = await promptPick('project', projects)
    }

    const cfg: ProjectConfig = {
      server,
      workspace: workspace.id,
      project: project.id,
      name: project.name,
    }
    saveProjectConfig(cfgPath, cfg)
    console.log(`wrote ${cfgPath}`)
    console.log(`  server:    ${server}`)
    console.log(`  workspace: #${workspace.id}  ${workspace.name}`)
    console.log(`  project:   #${project.id}  ${project.name}`)
  },
})
