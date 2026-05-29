import { defineCommand } from 'citty'
import { fmtSession, renderList } from '../../output.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'

export const sessionLsCommand = defineCommand({
  meta: { name: 'ls', description: 'list sessions in a project' },
  args: {
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const ss = await c.sessions.listByProject(resolveProjectId(args))
    console.log(renderList(ss, fmtSession, Boolean(args.json)))
  },
})
