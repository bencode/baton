import type { TaskStatus } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { fmtTask, removed, renderList, renderOne } from '../output.ts'
import { clientFor, common, splitCsv } from '../util.ts'

export const createTask = (
  c: ApiClient,
  input: {
    requirementId: string
    title: string
    spec?: string
    requires?: string[]
    dependsOn?: string[]
  },
  json: boolean,
): Promise<string> => c.tasks.create(input).then(t => renderOne(t, fmtTask, json))
export const listTasks = (c: ApiClient, requirementId: string, json: boolean): Promise<string> =>
  c.tasks.listByRequirement(requirementId).then(ts => renderList(ts, fmtTask, json))
export const getTask = (c: ApiClient, id: string, json: boolean): Promise<string> =>
  c.tasks.get(id).then(t => renderOne(t, fmtTask, json))
export const setTaskStatus = (
  c: ApiClient,
  id: string,
  status: TaskStatus,
  json: boolean,
): Promise<string> => c.tasks.setStatus(id, status).then(t => renderOne(t, fmtTask, json))
export const removeTask = (c: ApiClient, id: string, json: boolean): Promise<string> =>
  c.tasks.remove(id).then(() => removed('task', id, json))

export const task = defineCommand({
  meta: { name: 'task', description: 'manage tasks' },
  subCommands: {
    create: defineCommand({
      meta: { name: 'create', description: 'create a task' },
      args: {
        title: { type: 'positional', required: true },
        requirement: { type: 'string', required: true, description: 'requirement id' },
        spec: { type: 'string', description: 'short instruction' },
        requires: { type: 'string', description: 'comma-separated capability tags' },
        deps: { type: 'string', description: 'comma-separated prerequisite task ids' },
        ...common,
      },
      run: async ({ args }) => {
        const out = await createTask(
          clientFor(args),
          {
            requirementId: args.requirement,
            title: args.title,
            spec: args.spec,
            requires: splitCsv(args.requires),
            dependsOn: splitCsv(args.deps),
          },
          Boolean(args.json),
        )
        console.log(out)
      },
    }),
    ls: defineCommand({
      meta: { name: 'ls', description: 'list tasks in a requirement' },
      args: {
        requirement: { type: 'string', required: true, description: 'requirement id' },
        ...common,
      },
      run: async ({ args }) => {
        console.log(await listTasks(clientFor(args), args.requirement, Boolean(args.json)))
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a task' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await getTask(clientFor(args), args.id, Boolean(args.json)))
      },
    }),
    'set-status': defineCommand({
      meta: {
        name: 'set-status',
        description: 'set task status (todo|in_progress|done|failed|cancelled)',
      },
      args: {
        id: { type: 'positional', required: true },
        status: { type: 'positional', required: true },
        ...common,
      },
      run: async ({ args }) => {
        const out = await setTaskStatus(
          clientFor(args),
          args.id,
          args.status as TaskStatus,
          Boolean(args.json),
        )
        console.log(out)
      },
    }),
    rm: defineCommand({
      meta: { name: 'rm', description: 'delete a task' },
      args: { id: { type: 'positional', required: true }, ...common },
      run: async ({ args }) => {
        console.log(await removeTask(clientFor(args), args.id, Boolean(args.json)))
      },
    }),
  },
})
