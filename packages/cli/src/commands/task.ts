import type { Id, TaskStatus } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { fmtTask, removed, renderList, renderOne } from '../output.ts'
import { clientFor, common, resolveProjectId, splitCsv } from '../util.ts'

export const createTask = (
  c: ApiClient,
  input: { requirementId: Id; title: string; spec?: string; dependsOn?: Id[] },
  json: boolean,
): Promise<string> => c.tasks.create(input).then(t => renderOne(t, fmtTask, json))
export const listTasks = (c: ApiClient, requirementId: Id, json: boolean): Promise<string> =>
  c.tasks.listByRequirement(requirementId).then(ts => renderList(ts, fmtTask, json))
export const getTask = (c: ApiClient, id: Id, json: boolean): Promise<string> =>
  c.tasks.get(id).then(t => renderOne(t, fmtTask, json))
export const setTaskStatus = (
  c: ApiClient,
  id: Id,
  status: TaskStatus,
  json: boolean,
): Promise<string> => c.tasks.setStatus(id, status).then(t => renderOne(t, fmtTask, json))
export const removeTask = (c: ApiClient, id: Id, label: string, json: boolean): Promise<string> =>
  c.tasks.remove(id).then(() => removed('task', label, json))

const resolveReqByCode = async (c: ApiClient, projectId: Id, code: string): Promise<Id> =>
  (await c.requirements.getByCode(projectId, code)).id
const resolveTaskByCode = async (c: ApiClient, projectId: Id, code: string): Promise<Id> =>
  (await c.tasks.getByCode(projectId, code)).id

export const task = defineCommand({
  meta: { name: 'task', description: 'manage tasks' },
  subCommands: {
    create: defineCommand({
      meta: { name: 'create', description: 'create a task' },
      args: {
        title: { type: 'positional', required: true },
        requirement: { type: 'string', required: true, description: 'requirement code (R-N)' },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        spec: { type: 'string', description: 'short instruction' },
        deps: { type: 'string', description: 'comma-separated dependency task codes (T-N,T-N)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const projectId = resolveProjectId(args)
        const requirementId = await resolveReqByCode(c, projectId, args.requirement)
        const depCodes = splitCsv(args.deps) ?? []
        const dependsOn = await Promise.all(
          depCodes.map(code => resolveTaskByCode(c, projectId, code)),
        )
        console.log(
          await createTask(
            c,
            {
              requirementId,
              title: args.title,
              spec: args.spec,
              dependsOn: dependsOn.length ? dependsOn : undefined,
            },
            Boolean(args.json),
          ),
        )
      },
    }),
    ls: defineCommand({
      meta: { name: 'ls', description: 'list tasks in a requirement' },
      args: {
        requirement: { type: 'string', required: true, description: 'requirement code (R-N)' },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const reqId = await resolveReqByCode(c, resolveProjectId(args), args.requirement)
        console.log(await listTasks(c, reqId, Boolean(args.json)))
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get a task by code (T-N)' },
      args: {
        code: { type: 'positional', required: true },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveTaskByCode(c, resolveProjectId(args), args.code)
        console.log(await getTask(c, id, Boolean(args.json)))
      },
    }),
    'set-status': defineCommand({
      meta: {
        name: 'set-status',
        description: 'set task status (todo|in_progress|done|failed|cancelled)',
      },
      args: {
        code: { type: 'positional', required: true, description: 'task code (T-N)' },
        status: { type: 'positional', required: true },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveTaskByCode(c, resolveProjectId(args), args.code)
        console.log(await setTaskStatus(c, id, args.status as TaskStatus, Boolean(args.json)))
      },
    }),
    rm: defineCommand({
      meta: { name: 'rm', description: 'delete a task by code' },
      args: {
        code: { type: 'positional', required: true },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveTaskByCode(c, resolveProjectId(args), args.code)
        console.log(await removeTask(c, id, args.code, Boolean(args.json)))
      },
    }),
  },
})
