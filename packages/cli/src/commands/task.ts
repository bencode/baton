import type { ExternalRef, Id, TaskStatus } from '@baton/shared'
import { defineCommand } from 'citty'
import type { TaskUpdate } from '../client/tasks.ts'
import type { ApiClient } from '../client.ts'
import { fmtComment, fmtTask, removed, renderList, renderOne } from '../output.ts'
import { clientFor, common, parseIssueUrl, resolveProjectId, splitCsv } from '../util.ts'

export const createTask = (
  c: ApiClient,
  input: {
    requirementId: Id
    title: string
    body?: string
    dependsOn?: Id[]
    external?: ExternalRef
  },
  json: boolean,
): Promise<string> => c.tasks.create(input).then(t => renderOne(t, fmtTask, json))
export const updateTask = (
  c: ApiClient,
  id: Id,
  patch: TaskUpdate,
  json: boolean,
): Promise<string> => c.tasks.update(id, patch).then(t => renderOne(t, fmtTask, json))
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
export const addTaskComment = (
  c: ApiClient,
  taskId: Id,
  body: string,
  workerId: Id | undefined,
  json: boolean,
): Promise<string> =>
  c.tasks.addComment(taskId, body, workerId).then(x => renderOne(x, fmtComment, json))
export const listTaskComments = (c: ApiClient, taskId: Id, json: boolean): Promise<string> =>
  c.tasks.listComments(taskId).then(xs => renderList(xs, fmtComment, json))

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
        body: { type: 'string', description: 'task body (markdown)' },
        deps: { type: 'string', description: 'comma-separated dependency task codes (T-N,T-N)' },
        github: { type: 'string', description: 'link a GitHub issue url (light association)' },
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
              body: args.body,
              dependsOn: dependsOn.length ? dependsOn : undefined,
              external: args.github ? parseIssueUrl(args.github) : undefined,
            },
            Boolean(args.json),
          ),
        )
      },
    }),
    update: defineCommand({
      meta: { name: 'update', description: 'update a task title / body' },
      args: {
        code: { type: 'positional', required: true, description: 'task code (T-N)' },
        title: { type: 'string', description: 'new title' },
        body: { type: 'string', description: 'new body (markdown)' },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const patch: TaskUpdate = {
          ...(args.title !== undefined ? { title: args.title } : {}),
          ...(args.body !== undefined ? { body: args.body } : {}),
        }
        if (Object.keys(patch).length === 0) throw new Error('pass --title and/or --body')
        const c = clientFor(args)
        const id = await resolveTaskByCode(c, resolveProjectId(args), args.code)
        console.log(await updateTask(c, id, patch, Boolean(args.json)))
      },
    }),
    link: defineCommand({
      meta: { name: 'link', description: 'link a task to a GitHub issue url' },
      args: {
        code: { type: 'positional', required: true, description: 'task code (T-N)' },
        // Named `issue` (not `url`) — `url` would collide with the common --url flag.
        issue: { type: 'positional', required: true, description: 'GitHub issue url' },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveTaskByCode(c, resolveProjectId(args), args.code)
        console.log(
          await updateTask(c, id, { external: parseIssueUrl(args.issue) }, Boolean(args.json)),
        )
      },
    }),
    unlink: defineCommand({
      meta: { name: 'unlink', description: 'clear a task’s GitHub issue association' },
      args: {
        code: { type: 'positional', required: true, description: 'task code (T-N)' },
        project: { type: 'string', description: 'project id (overrides .baton.json)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveTaskByCode(c, resolveProjectId(args), args.code)
        console.log(await updateTask(c, id, { external: null }, Boolean(args.json)))
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
    comment: defineCommand({
      meta: { name: 'comment', description: 'append-only task comments' },
      subCommands: {
        add: defineCommand({
          meta: { name: 'add', description: 'add a comment to a task' },
          args: {
            code: { type: 'positional', required: true, description: 'task code (T-N)' },
            body: { type: 'positional', required: true, description: 'comment text (markdown)' },
            worker: { type: 'string', description: 'attribute to a worker id (omit = human)' },
            project: { type: 'string', description: 'project id (overrides .baton.json)' },
            ...common,
          },
          run: async ({ args }) => {
            const c = clientFor(args)
            const id = await resolveTaskByCode(c, resolveProjectId(args), args.code)
            const workerId = args.worker ? Number(args.worker) : undefined
            console.log(await addTaskComment(c, id, args.body, workerId, Boolean(args.json)))
          },
        }),
        ls: defineCommand({
          meta: { name: 'ls', description: 'list a task’s comments in order' },
          args: {
            code: { type: 'positional', required: true, description: 'task code (T-N)' },
            project: { type: 'string', description: 'project id (overrides .baton.json)' },
            ...common,
          },
          run: async ({ args }) => {
            const c = clientFor(args)
            const id = await resolveTaskByCode(c, resolveProjectId(args), args.code)
            console.log(await listTaskComments(c, id, Boolean(args.json)))
          },
        }),
      },
    }),
  },
})
