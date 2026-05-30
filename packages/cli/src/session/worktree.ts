import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Provision a git worktree for a session. Creates a branch named
// `baton/<sessionCode>` checked out at `base` in the target path. The repo
// argument is any path inside the source repo (works with `git -C`).
export const createWorktree = (input: {
  repo: string
  worktreePath: string
  sessionCode: string
  base: string
}): void => {
  if (existsSync(input.worktreePath))
    throw new Error(`worktree path already exists: ${input.worktreePath}`)
  mkdirSync(dirname(input.worktreePath), { recursive: true })
  const branch = `baton/${input.sessionCode}`
  const r = spawnSync(
    'git',
    ['-C', input.repo, 'worktree', 'add', '-b', branch, input.worktreePath, input.base],
    { stdio: 'pipe', encoding: 'utf8' },
  )
  if (r.status !== 0) {
    throw new Error(`git worktree add failed: ${r.stderr || r.stdout || `exit ${r.status}`}`)
  }
}

// The repo's currently checked-out branch — the base a new worktree forks from.
// Falls back to 'main' on detached HEAD / non-git / any failure.
export const repoHeadBranch = (repo: string): string => {
  const r = spawnSync('git', ['-C', repo, 'symbolic-ref', '--short', 'HEAD'], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  const branch = r.status === 0 ? r.stdout.trim() : ''
  return branch || 'main'
}

// Best-effort removal. Won't throw on missing/unclean state.
export const removeWorktree = (repo: string, worktreePath: string): void => {
  if (!existsSync(worktreePath)) return
  try {
    execFileSync('git', ['-C', repo, 'worktree', 'remove', '--force', worktreePath], {
      stdio: 'pipe',
    })
  } catch {
    // ignore
  }
}
