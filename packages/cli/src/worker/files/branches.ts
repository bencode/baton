import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { FileBranch } from '@baton/shared'

const run = promisify(execFile)
const GIT_TIMEOUT_MS = 3_000
const NOT_A_WORK_TREE_EXIT = 128

const git = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await run('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout
}

// Top of the work tree containing `dir`, or null outside one (no repository, a
// bare repository, or inside .git all exit 128).
const workTreeTop = async (dir: string): Promise<string | null> => {
  try {
    return await realpath((await git(dir, ['rev-parse', '--show-toplevel'])).trim())
  } catch (error) {
    if ((error as { code?: unknown }).code !== NOT_A_WORK_TREE_EXIT)
      console.warn('[files] git rev-parse failed; no branches to browse', error)
    return null
  }
}

type Worktree = { path: string; name: string }

// `git worktree list --porcelain -z`: NUL-terminated fields, records separated by
// an extra NUL. Bare, prunable (directory gone), and detached records have no
// browsable branch and are skipped.
const parseWorktrees = (stdout: string): Worktree[] =>
  stdout
    .split('\0\0')
    .map(record => record.split('\0').filter(Boolean))
    .flatMap(fields => {
      const path = fields.find(field => field.startsWith('worktree '))?.slice('worktree '.length)
      const ref = fields.find(field => field.startsWith('branch '))?.slice('branch '.length)
      const skipped = fields.some(field => field === 'bare' || field.startsWith('prunable'))
      return path && ref && !skipped ? [{ path, name: ref.replace(/^refs\/heads\//, '') }] : []
    })

const existingPath = async (path: string): Promise<string | null> => {
  try {
    return await realpath(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`[files] cannot resolve worktree ${path}`, error)
    return null
  }
}

// The branches a Worker may browse: every branch checked out in a worktree of the
// repository whose root is the Worker's own directory. A directory that is not a
// work tree root (no repository, a subdirectory, a bare repository) exposes nothing.
export const discoverBranches = async (baseDir: string): Promise<FileBranch[]> => {
  const base = await realpath(baseDir)
  if ((await workTreeTop(base)) !== base) return []
  let worktrees: Worktree[]
  try {
    worktrees = parseWorktrees(await git(base, ['worktree', 'list', '--porcelain', '-z']))
  } catch (error) {
    console.warn('[files] git worktree list failed; no branches to browse', error)
    return []
  }
  const branches = await Promise.all(
    worktrees.map(async ({ path, name }): Promise<FileBranch | null> => {
      const real = await existingPath(path)
      return real === null ? null : { name, path: real, current: real === base }
    }),
  )
  return branches
    .filter((branch): branch is FileBranch => branch !== null)
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    )
}
