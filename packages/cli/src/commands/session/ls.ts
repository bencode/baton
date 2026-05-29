import { defineCommand } from 'citty'
import { fmtSession, renderList } from '../../output.ts'
import { clientFor, common } from '../../util.ts'

export const sessionLsCommand = defineCommand({
  meta: { name: 'ls', description: 'list sessions in a project' },
  args: {
    project: { type: 'string', required: true, description: 'project id (int)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const ss = await c.sessions.listByProject(Number(args.project))
    console.log(renderList(ss, fmtSession, Boolean(args.json)))
  },
})
