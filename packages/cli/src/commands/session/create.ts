import { defineCommand } from 'citty'
import { fmtSession, renderOne } from '../../output.ts'
import { loadProjectConfigOrNull, projectConfigPath } from '../../project-config.ts'
import { clientFor, common, parseWorkerHandle, resolveProjectId } from '../../util.ts'

// Create a session on a worker. The server pushes session.start to that worker,
// which materializes + spawns the child and reports it active.
//
// `--worker` takes the global W-N handle (or bare int id) — and since the
// worker row knows its own project, `--project` becomes optional: addressing a
// worker by number alone is enough to open a session anywhere ("W-7 开个
// session"), no project lookup dance first.
export const sessionCreateCommand = defineCommand({
  meta: { name: 'create', description: 'create + start a session on a worker' },
  args: {
    name: { type: 'positional', required: true, description: 'session name' },
    worker: {
      type: 'string',
      description: "worker handle: W-N or int id (default: this machine's worker)",
    },
    project: {
      type: 'string',
      description: "project id (default: the worker's own project, else .baton.json)",
    },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const workerId = args.worker
      ? parseWorkerHandle(args.worker)
      : (loadProjectConfigOrNull(projectConfigPath())?.worker?.id ?? null)
    if (workerId === null)
      throw new Error(
        'no worker — pass --worker <W-N|id> or run `baton worker register` first (names need --project)',
      )
    // Explicit --project wins; otherwise derive it from the worker itself so a
    // bare global handle is a complete address. .baton.json stays the fallback.
    const projectId =
      args.project !== undefined && args.project !== ''
        ? Number(args.project)
        : args.worker
          ? (await c.workers.get(workerId)).projectId
          : resolveProjectId(args)
    const s = await c.sessions.create({ projectId, workerId, name: args.name })
    console.log(renderOne(s, fmtSession, Boolean(args.json)))
  },
})
