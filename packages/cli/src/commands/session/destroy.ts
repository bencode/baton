import { defineCommand } from 'citty'
import {
  loadProjectConfig,
  projectConfigPath,
  removeSession,
  viewSession,
} from '../../project-config.ts'
import { removeWorktree } from '../../session/worktree.ts'
import { clientFor, common, resolveProjectId } from '../../util.ts'
import { resolveSession } from './shared.ts'

// DELETE a session — drops the row + all SessionEvent rows (FK Cascade). The
// physical worktree + agent state file (claude .jsonl) are NOT touched by
// default; pass --rm-worktree to remove the worktree as well.
//
// Server route is DELETE /sessions/:id (no auth, v0 — gated by --confirm).
// Local entry in .baton.json is best-effort removed. --rm-worktree needs
// --repo because git worktree remove only works when invoked from the source
// repo.
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
      description: 'override .baton.json path (default: ./.baton.json)',
    },
    ...common,
  },
  run: async ({ args }) => {
    const c = clientFor(args)
    const projectId = resolveProjectId(args)
    const s = await resolveSession(c, projectId, args.session)
    const events = await c.sessions.listEvents(s.id)
    const cfgPath = args.config ?? projectConfigPath()
    const localCfg = (() => {
      try {
        return loadProjectConfig(cfgPath)
      } catch {
        return null
      }
    })()
    const localEntry = localCfg?.sessions?.[String(s.id)] ?? null

    if (!args.confirm) {
      console.log(`[dry-run] would destroy session ${s.name} (#${s.id}):`)
      console.log(`  - ${events.length} event(s) cascade-deleted`)
      console.log(
        `  - local entry in .baton.json: ${localEntry ? 'present (will remove)' : 'not present'}`,
      )
      if (args['rm-worktree']) console.log('  - git worktree (--rm-worktree)')
      console.log('re-run with --confirm to proceed.')
      return
    }

    // Worktree path comes from the local entry if we have it; otherwise we
    // fetch the row to learn the stable DB field.
    const worktreePath = localEntry
      ? viewSession(localCfg!, s.id).worktreePath
      : (await c.sessions.get(s.id)).worktreePath

    await c.sessions.destroy(s.id)
    if (localEntry) removeSession(cfgPath, s.id)
    if (args['rm-worktree']) {
      if (!args.repo) throw new Error('--repo is required together with --rm-worktree')
      removeWorktree(args.repo, worktreePath)
    }
    console.log(`destroyed ${s.name} (#${s.id}); ${events.length} event(s) gone`)
  },
})
