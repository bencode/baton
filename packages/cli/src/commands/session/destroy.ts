import { existsSync, rmSync } from 'node:fs'
import { defineCommand } from 'citty'
import { createWorkerClient } from '../../client.ts'
import { defaultConfigPath, loadConfig } from '../../session/config.ts'
import { removeWorktree } from '../../session/worktree.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// DELETE a session — drops the row + all SessionEvent rows (FK Cascade). The
// physical worktree + agent state file (claude .jsonl) are NOT touched by
// default; pass --rm-worktree to remove the worktree as well.
//
// Default behaviour requires --confirm. Without it, we print a dry-run
// summary so the user can see what will go away before re-running with the
// flag.
export const sessionDestroyCommand = defineCommand({
  meta: {
    name: 'destroy',
    description: 'permanently delete a session and its event log (irreversible)',
  },
  args: {
    session: { type: 'positional', required: true, description: 'session int id or name' },
    project: { type: 'string', description: 'project id (overrides .baton.json)' },
    confirm: { type: 'boolean', description: 'actually perform the deletion' },
    'rm-worktree': {
      type: 'boolean',
      description: 'also remove the git worktree (default keeps disk state)',
    },
    repo: { type: 'string', description: 'source repo path (required with --rm-worktree)' },
    config: {
      type: 'string',
      description: 'override config path (default ~/.config/baton/session-<id>.json)',
    },
    ...common,
  },
  run: async ({ args }) => {
    const cliClient = clientFor(args)
    const projectId = resolveProjectId(args)
    const s = await resolveSession(cliClient, projectId, args.session)
    const events = await cliClient.sessions.listEvents(s.id)
    const cfgPath = args.config ?? defaultConfigPath(s.id)

    if (!args.confirm) {
      console.log(`[dry-run] would destroy session ${s.name} (#${s.id}):`)
      console.log(`  - ${events.length} event(s) cascade-deleted`)
      console.log(`  - local session config: ${cfgPath}`)
      if (args['rm-worktree']) console.log('  - git worktree (--rm-worktree)')
      console.log('re-run with --confirm to proceed.')
      return
    }

    const cfg = loadConfig(cfgPath)
    const w = createWorkerClient(cfg.server, cfg.apiToken)
    await w.destroy()
    if (existsSync(cfgPath)) rmSync(cfgPath, { force: true })
    if (args['rm-worktree']) {
      if (!args.repo) throw new Error('--repo is required together with --rm-worktree')
      removeWorktree(args.repo, cfg.worktreePath)
    }
    console.log(`destroyed ${s.name} (#${s.id}); ${events.length} event(s) gone`)
  },
})
