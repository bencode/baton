import { defineCommand } from 'citty'
import { createWorkerClient } from '../../client.ts'
import { defaultConfigPath, loadConfig } from '../../session/config.ts'
import { runDaemon } from '../../session/runner.ts'
import { clientFor, common } from '../../util.ts'
import { parseEnvPairs, resolveSession } from './shared.ts'

export const sessionRunCommand = defineCommand({
  meta: {
    name: 'run',
    description: 'subscribe to a session and run claude turns as messages arrive',
  },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', required: true, description: 'project id (int)' },
    config: {
      type: 'string',
      description: 'override config path (default ~/.config/baton/session-<id>.json)',
    },
    env: {
      type: 'string',
      description: 'env injected into the spawned claude (KEY=VAL; CSV-multi or repeat flag)',
    },
    ...common,
  },
  run: async ({ args }) => {
    const cliClient = clientFor(args)
    const projectId = Number(args.project)
    const handle = await resolveSession(cliClient, projectId, args.session)
    const cfgPath = args.config ?? defaultConfigPath(handle.id)
    const cfg = loadConfig(cfgPath)
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
