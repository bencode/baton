import { execFile, execFileSync, type SpawnSyncReturns, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'
import { promisify } from 'node:util'

const git = (repo: string, args: string[]): SpawnSyncReturns<string> =>
  spawnSync('git', ['-C', repo, ...args], {
    stdio: 'pipe',
    encoding: 'utf8',
  })

const commandError = (result: SpawnSyncReturns<string>): string => {
  const raw = result.stderr || result.stdout || result.error?.message || `exit ${result.status}`
  // Do not accidentally copy an embedded HTTPS credential into worker logs.
  return raw.trim().replace(/(https?:\/\/)[^/@\s]+@/g, '$1***@')
}

const execFileAsync = promisify(execFile)
const DEFAULT_SYNC_TIMEOUT_MS = 60_000

type CommandFailure = Error & {
  code?: string | number
  killed?: boolean
  stderr?: string
  stdout?: string
}

const asyncCommandError = (error: unknown, timeoutMs: number): string => {
  const failure = error as CommandFailure
  if (failure.killed || failure.code === 'ETIMEDOUT') return `timed out after ${timeoutMs}ms`
  const raw = failure.stderr || failure.stdout || failure.message || String(error)
  return raw.trim().replace(/(https?:\/\/)[^/@\s]+@/g, '$1***@')
}

export const validateBaseBranch = (branch: string): string => {
  const normalized = branch.trim()
  const valid = spawnSync('git', ['check-ref-format', '--branch', normalized], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  if (valid.status !== 0)
    throw new Error(`invalid base branch "${normalized}": ${commandError(valid)}`)
  return normalized
}

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
  // An unborn HEAD (repo with zero commits) makes `git worktree add` fail with
  // a cryptic "invalid reference" — surface the real cause instead.
  const head = spawnSync('git', ['-C', input.repo, 'rev-parse', '--verify', '-q', 'HEAD'], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  if (head.status !== 0)
    throw new Error(
      `repo has no commits (unborn HEAD) — create an initial commit before starting sessions`,
    )
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
  const r = git(repo, ['symbolic-ref', '--short', 'HEAD'])
  const branch = r.status === 0 ? r.stdout.trim() : ''
  return branch || 'main'
}

// Refresh the configured branch without moving the source checkout. New worktrees
// fork from the updated remote-tracking ref, so a long-lived worker cannot silently
// create sessions from a stale local branch. A trusted helper can perform the fetch
// out-of-process (for example through a credential-holding broker); it receives
// exactly two arguments: <repo> <branch>.
export const syncBaseBranch = async (
  repo: string,
  branch: string,
  options: { env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<string> => {
  const checkedBranch = validateBaseBranch(branch)
  const env = options.env ?? process.env
  const timeoutMs = options.timeoutMs ?? DEFAULT_SYNC_TIMEOUT_MS

  const origin = git(repo, ['remote', 'get-url', 'origin'])
  if (origin.status !== 0) {
    const localRef = `refs/heads/${checkedBranch}`
    const verified = git(repo, ['rev-parse', '--verify', '-q', localRef])
    if (verified.status !== 0) throw new Error(`local base branch does not exist: ${checkedBranch}`)
    return localRef
  }

  const helper = env.BATON_GIT_SYNC_BIN?.trim()
  const command = helper ?? 'git'
  const args = helper
    ? [repo, checkedBranch]
    : [
        '-C',
        repo,
        'fetch',
        '--no-tags',
        'origin',
        `+refs/heads/${checkedBranch}:refs/remotes/origin/${checkedBranch}`,
      ]
  let synced: { stdout: string; stderr: string }
  try {
    synced = await execFileAsync(command, args, {
      encoding: 'utf8',
      env: { ...env, GIT_TERMINAL_PROMPT: '0' },
      timeout: timeoutMs,
    })
  } catch (error) {
    const via = helper ? ` via ${helper}` : ''
    throw new Error(
      `git sync failed for origin/${checkedBranch}${via}: ${asyncCommandError(error, timeoutMs)}`,
    )
  }

  const remoteRef = `refs/remotes/origin/${checkedBranch}`
  const verified = git(repo, ['rev-parse', '--verify', '-q', remoteRef])
  if (verified.status !== 0) throw new Error(`git sync succeeded but ${remoteRef} does not exist`)
  if (helper) {
    const reportedCommit = synced.stdout.trim()
    const actualCommit = verified.stdout.trim()
    if (!/^[0-9a-f]{40,64}$/i.test(reportedCommit))
      throw new Error('git sync helper did not report the synced commit on stdout')
    if (reportedCommit !== actualCommit)
      throw new Error(`git sync helper reported a commit that does not match ${remoteRef}`)
  }
  return remoteRef
}

// Append a pattern to the repo's `.git/info/exclude` unless already present.
// Shared by all worktrees (git resolves info/exclude to the common dir) and
// never touches the target repo's tracked files — used to keep the injected
// `.baton.json` (worker token inside) out of agent commits. Best-effort.
export const ensureExcluded = (repo: string, pattern: string): void => {
  try {
    const r = spawnSync('git', ['-C', repo, 'rev-parse', '--git-path', 'info/exclude'], {
      stdio: 'pipe',
      encoding: 'utf8',
    })
    if (r.status !== 0) return
    const rel = r.stdout.trim()
    const path = isAbsolute(rel) ? rel : resolve(repo, rel)
    const current = existsSync(path) ? readFileSync(path, 'utf8') : ''
    if (current.split('\n').includes(pattern)) return
    mkdirSync(dirname(path), { recursive: true })
    const sep = current === '' || current.endsWith('\n') ? '' : '\n'
    appendFileSync(path, `${sep}${pattern}\n`, 'utf8')
  } catch {
    // ignore
  }
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

// Restore a materialized session's worktree when its directory went missing
// (container rebuild / manual cleanup). `prune` clears the dead registration so
// git releases the branch + path, then we re-attach the EXISTING branch
// `baton/<sessionCode>` into a fresh checkout — preserving its committed history.
// If the branch is gone too, fall back to a brand-new worktree from HEAD. The
// claude transcript lives in ~/.claude/projects (separate from the worktree), so
// the conversation resumes either way.
export const restoreWorktree = async (
  repo: string,
  worktreePath: string,
  sessionCode: string,
  baseBranch: string = repoHeadBranch(repo),
): Promise<void> => {
  spawnSync('git', ['-C', repo, 'worktree', 'prune'], { stdio: 'pipe' })
  mkdirSync(dirname(worktreePath), { recursive: true })
  const branch = `baton/${sessionCode}`
  const reuse = spawnSync('git', ['-C', repo, 'worktree', 'add', worktreePath, branch], {
    stdio: 'pipe',
    encoding: 'utf8',
  })
  if (reuse.status === 0) return
  // Branch gone (or unattachable) → fresh worktree from the repo's head branch.
  createWorktree({
    repo,
    worktreePath,
    sessionCode,
    base: await syncBaseBranch(repo, baseBranch),
  })
}
