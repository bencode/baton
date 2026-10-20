import { realpath } from 'node:fs/promises'
import type { FileBranch } from '@baton/shared'
import { runGit } from './git.ts'

const NOT_A_WORK_TREE_EXIT = 128

const git = async (cwd: string, args: string[]): Promise<string> =>
  (await runGit(cwd, args)).toString('utf8')

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

// `git for-each-ref` lines of "<refname>\0<commit>"; ref names cannot contain newlines.
const parseTips = (stdout: string): Map<string, string> =>
  new Map(
    stdout
      .split('\n')
      .map(line => line.split('\0'))
      .flatMap(([ref, commit]) =>
        ref && commit ? [[ref.replace(/^refs\/heads\//, ''), commit] as const] : [],
      ),
  )

const existingPath = async (path: string): Promise<string | null> => {
  try {
    return await realpath(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.warn(`[files] cannot resolve worktree ${path}`, error)
    return null
  }
}

const rank = (branch: FileBranch): number => (branch.current ? 0 : branch.worktree ? 1 : 2)

// The local branches of the repository whose work tree root is the Worker's own
// directory: those checked out in an existing worktree plus every other local
// branch. The unborn branch of a repository without commits appears only through
// its worktree. A directory that is not a work tree root (no repository, a
// subdirectory, a bare repository) exposes nothing.
export const discoverBranches = async (baseDir: string): Promise<FileBranch[]> => {
  const base = await realpath(baseDir)
  if ((await workTreeTop(base)) !== base) return []
  let worktrees: Worktree[]
  let tips: Map<string, string>
  try {
    const [listed, refs] = await Promise.all([
      git(base, ['worktree', 'list', '--porcelain', '-z']),
      git(base, ['for-each-ref', '--format=%(refname)%00%(objectname)', 'refs/heads']),
    ])
    worktrees = parseWorktrees(listed)
    tips = parseTips(refs)
  } catch (error) {
    console.warn('[files] listing git branches failed; no branches to browse', error)
    return []
  }
  const checkedOut = new Map(
    (
      await Promise.all(
        worktrees.map(async ({ path, name }) => [name, await existingPath(path)] as const),
      )
    ).filter((entry): entry is readonly [string, string] => entry[1] !== null),
  )
  return [...new Set([...checkedOut.keys(), ...tips.keys()])]
    .map(name => {
      const worktree = checkedOut.get(name) ?? null
      return { name, worktree, commit: tips.get(name) ?? null, current: worktree === base }
    })
    .sort((a, b) => rank(a) - rank(b) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}
