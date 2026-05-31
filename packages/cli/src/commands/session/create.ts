import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { loadProjectConfigOrNull, projectConfigPath } from '../../project-config.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'

// Create a session on a worker. The server pushes session.start to that worker,
// which materializes + spawns the child and reports it active.
export const sessionCreateCommand = defineCommand({
  meta: { name: 'create', description: 'create + start a session on a worker' },
  args: {
    name: { type: 'positional', required: true, description: 'session name' },
    worker: { type: 'string', description: "worker id (default: this machine's worker)" },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const projectId = resolveProjectId(args)
    const workerId = args.worker
      ? Number(args.worker)
      : loadProjectConfigOrNull(projectConfigPath())?.worker?.id
    if (!workerId)
      throw new Error('no worker id — pass --worker or run `baton worker register` first')
    const s = await c.sessions.create({ projectId, workerId, name: args.name })
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
