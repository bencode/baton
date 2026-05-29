import { defineCommand } from 'citty'
import { createWorkerClient } from '../../client.ts'
import { loadProjectConfig, projectConfigPath, viewSession } from '../../project-config.ts'
import { runDaemon } from '../../session/runner.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { parseEnvPairs, resolveSession } from './shared.ts'

// Primitive form of the top-level `baton start`: attach a daemon to an
// already-registered session. Doesn't create worker / session if missing —
// use `baton start --name X` for that. Same protocol (heartbeat + SSE + drain).
export const sessionStartCommand = defineCommand({
  meta: {
    name: 'start',
    description: 'attach a daemon to an existing session and run agent turns',
  },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    config: {
      type: 'string',
      description: 'override .baton.json path (default: ./.baton.json)',
    },
    env: {
      type: 'string',
      description: 'env injected into the spawned agent (KEY=VAL; CSV-multi or repeat flag)',
    },
    ...common,
  },
  run: async ({ args }) => {
    const cliClient = clientFor(args)
    const projectId = resolveProjectId(args)
    const handle = await resolveSession(cliClient, projectId, args.session)
    const cfgPath = args.config ?? projectConfigPath()
    const cfg = viewSession(loadProjectConfig(cfgPath), handle.id)
    const runEnv = parseEnvPairs(args.env as string | string[] | undefined)
    const worker = createWorkerClient(cfg.server, cfg.apiToken)
    const ac = new AbortController()
    const stop = () => ac.abort()
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    const tag = `#${cfg.sessionId} ${cfg.name}`
    console.log(`[${tag}] running (worktree: ${cfg.worktreePath})`)
    if (runEnv) console.log(`[${tag}] env keys: ${Object.keys(runEnv).join(', ')}`)
    await runDaemon(cfg, { client: cliClient, worker, env: runEnv }, ac.signal)
    console.log(`[${tag}] stopped`)
  },
})
