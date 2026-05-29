import { defineCommand } from 'citty'
import { createWorkerClient } from '../../client.ts'
import { defaultConfigPath, loadConfig } from '../../session/config.ts'
import { removeWorktree } from '../../session/worktree.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

export const sessionCloseCommand = defineCommand({
  meta: { name: 'close', description: 'close a session (optionally remove its worktree)' },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    'rm-worktree': { type: 'boolean', description: 'also remove the git worktree' },
    repo: { type: 'string', description: 'source repo path (required with --rm-worktree)' },
    config: {
      type: 'string',
      description: 'path to session config (default ~/.config/baton/session-<id>.json)',
    },
    ...common,
  },
  run: async ({ args }) => {
    const cliClient = clientFor(args)
    const projectId = resolveProjectId(args)
    const s = await resolveSession(cliClient, projectId, args.session)
    const cfgPath = args.config ?? defaultConfigPath(s.id)
    const cfg = loadConfig(cfgPath)
    const w = createWorkerClient(cfg.server, cfg.apiToken)
    await w.close()
    if (args['rm-worktree']) {
      if (!args.repo) throw new Error('--repo is required together with --rm-worktree')
      removeWorktree(args.repo, cfg.worktreePath)
    }
    console.log(`closed ${s.name} (#${s.id})`)
  },
})
