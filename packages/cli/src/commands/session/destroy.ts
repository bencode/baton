import { existsSync, rmSync } from 'node:fs'
import { defineCommand } from 'citty'
import { defaultConfigPath, loadConfig } from '../../session/config.ts'
import { removeWorktree } from '../../session/worktree.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// DELETE a session — drops the row + all SessionEvent rows (FK Cascade). The
// physical worktree + agent state file (claude .jsonl) are NOT touched by
// default; pass --rm-worktree to remove the worktree as well.
//
// Implementation: server route is DELETE /sessions/:id (no auth, v0 — gated
// by the CLI's --confirm flag). Local session config file is best-effort
// cleaned up. --rm-worktree needs --repo because we need to know which
// upstream the worktree was branched off (git worktree remove only works
// when invoked from the source repo).
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
    const c = clientFor(args)
    const projectId = resolveProjectId(args)
    const s = await resolveSession(c, projectId, args.session)
    const events = await c.sessions.listEvents(s.id)
    const cfgPath = args.config ?? defaultConfigPath(s.id)
    const cfgPresent = existsSync(cfgPath)

    if (!args.confirm) {
      console.log(`[dry-run] would destroy session ${s.name} (#${s.id}):`)
      console.log(`  - ${events.length} event(s) cascade-deleted`)
      console.log(`  - local session config: ${cfgPath}${cfgPresent ? '' : ' (not present)'}`)
      if (args['rm-worktree']) console.log('  - git worktree (--rm-worktree)')
      console.log('re-run with --confirm to proceed.')
      return
    }

    // Worktree path comes from the local config if we have it; otherwise we
    // fetch the row to learn the stable DB field.
    const worktreePath = cfgPresent
      ? loadConfig(cfgPath).worktreePath
      : (await c.sessions.get(s.id)).worktreePath

    await c.sessions.destroy(s.id)
    if (cfgPresent) rmSync(cfgPath, { force: true })
    if (args['rm-worktree']) {
      if (!args.repo) throw new Error('--repo is required together with --rm-worktree')
      removeWorktree(args.repo, worktreePath)
    }
    console.log(`destroyed ${s.name} (#${s.id}); ${events.length} event(s) gone`)
  },
})
