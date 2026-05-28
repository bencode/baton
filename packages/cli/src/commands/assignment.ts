import type { AssignmentStatus, Id } from '@baton/shared'
import { defineCommand } from 'citty'
import type { ApiClient } from '../client.ts'
import { fmtAssignment, renderList, renderOne, toJson } from '../output.ts'
import { clientFor, common, splitCsv } from '../util.ts'

export const listAssignments = (
  c: ApiClient,
  projectId: Id,
  filter: { status?: AssignmentStatus[]; sessionId?: Id },
  json: boolean,
): Promise<string> =>
  c.assignments.listByProject(projectId, filter).then(as => renderList(as, fmtAssignment, json))

const resolveAssignmentByCode = async (c: ApiClient, projectId: Id, code: string): Promise<Id> => {
  // Fall back to project items endpoint; ApiClient doesn't yet expose direct getByCode for A-N.
  const all = await c.assignments.listByProject(projectId)
  const a = all.find(x => x.code === code)
  if (!a) throw new Error(`assignment ${code} not found in project ${projectId}`)
  return a.id
}

export const assignment = defineCommand({
  meta: { name: 'assignment', description: 'inspect task executions' },
  subCommands: {
    ls: defineCommand({
      meta: { name: 'ls', description: 'list assignments in a project' },
      args: {
        project: { type: 'string', required: true, description: 'project id (int)' },
        status: {
          type: 'string',
          description: 'comma-separated status filter (running,done,failed,abandoned)',
        },
        session: { type: 'string', description: 'filter by session id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const status = splitCsv(args.status) as AssignmentStatus[] | undefined
        const sessionId = args.session ? Number(args.session) : undefined
        console.log(
          await listAssignments(
            clientFor(args),
            Number(args.project),
            { status, sessionId },
            Boolean(args.json),
          ),
        )
      },
    }),
    get: defineCommand({
      meta: { name: 'get', description: 'get an assignment by code (A-N)' },
      args: {
        code: { type: 'positional', required: true },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveAssignmentByCode(c, Number(args.project), args.code)
        const a = await c.assignments.get(id)
        console.log(renderOne(a, fmtAssignment, Boolean(args.json)))
      },
    }),
    events: defineCommand({
      meta: { name: 'events', description: 'dump all events of an assignment (A-N)' },
      args: {
        code: { type: 'positional', required: true },
        project: { type: 'string', required: true, description: 'project id (int)' },
        ...common,
      },
      run: async ({ args }) => {
        const c = clientFor(args)
        const id = await resolveAssignmentByCode(c, Number(args.project), args.code)
        const events = await c.assignments.events(id)
        if (args.json) console.log(toJson(events))
        else for (const e of events) console.log(`#${e.sequence}  ${JSON.stringify(e.payload)}`)
      },
    }),
  },
})
