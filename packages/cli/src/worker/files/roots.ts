import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { realpath } from 'node:fs/promises'
import { promisify } from 'node:util'
import type { FileRoot } from '@baton/shared'

const run = promisify(execFile)
const GIT_TIMEOUT_MS = 3_000
const NOT_A_REPOSITORY_EXIT = 128

const git = async (cwd: string, args: string[]): Promise<string> => {
  const { stdout } = await run('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
  })
  return stdout
}

const rootId = (path: string): string =>
  createHash('sha256').update(path).digest('hex').slice(0, 16)

const directoryRoot = (path: string): FileRoot => ({
  id: rootId(path),
  path,
  kind: 'directory',
  branch: null,
  current: true,
})

// `git rev-parse --is-inside-git-dir`: true inside a bare repository or a .git
// directory, false in a work tree, null when `dir` is not in a repository at all.
const insideGitDir = async (dir: string): Promise<boolean | null> => {
  try {
    return (await git(dir, ['rev-parse', '--is-inside-git-dir'])).trim() === 'true'
  } catch (error) {
    if ((error as { code?: unknown }).code !== NOT_A_REPOSITORY_EXIT)
      console.warn('[files] git rev-parse failed; treating as a plain directory', error)
    return null
  }
}

type Worktree = { path: string; branch: string | null }

// `git worktree list --porcelain -z`: NUL-terminated fields, records separated by
// an extra NUL. Bare and prunable (directory already gone) records are skipped.
const parseWorktrees = (stdout: string): Worktree[] =>
  stdout
    .split('\0\0')
    .map(record => record.split('\0').filter(Boolean))
    .flatMap(fields => {
      const path = fields.find(field => field.startsWith('worktree '))?.slice('worktree '.length)
      const skipped = fields.some(field => field === 'bare' || field.startsWith('prunable'))
      if (!path || skipped) return []
      const ref = fields.find(field => field.startsWith('branch '))?.slice('branch '.length)
      return [{ path, branch: ref?.replace(/^refs\/heads\//, '') ?? null }]
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

// The roots a Worker may browse: its own directory and, when that directory is a
// Git work tree root, the other existing worktrees of the same repository. A daemon
// started in a repository subdirectory only exposes that subdirectory, and a bare
// repository exposes nothing.
export const discoverRoots = async (baseDir: string): Promise<FileRoot[]> => {
  const base = await realpath(baseDir)
  const inGitDir = await insideGitDir(base)
  if (inGitDir === null) return [directoryRoot(base)]
  if (inGitDir) return []
  const topLevel = await realpath((await git(base, ['rev-parse', '--show-toplevel'])).trim())
  if (topLevel !== base) return [directoryRoot(base)]
  let worktrees: Worktree[]
  try {
    worktrees = parseWorktrees(await git(base, ['worktree', 'list', '--porcelain', '-z']))
  } catch (error) {
    console.warn('[files] git worktree list failed; exposing only the worker directory', error)
    return [directoryRoot(base)]
  }
  const roots = await Promise.all(
    worktrees.map(async ({ path, branch }): Promise<FileRoot | null> => {
      const real = await existingPath(path)
      return real === null
        ? null
        : { id: rootId(real), path: real, kind: 'worktree', branch, current: real === base }
    }),
  )
  return roots
    .filter((root): root is FileRoot => root !== null)
    .sort(
      (a, b) =>
        Number(b.current) - Number(a.current) || (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
    )
}
