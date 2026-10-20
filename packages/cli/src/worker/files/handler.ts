import type {
  FileBranch,
  FileDirectory,
  FileQuery,
  FileReply,
  FileSearchResult,
  FileView,
} from '@baton/shared'
import { discoverBranches } from './branches.ts'
import { listCommitDirectory, searchCommit, viewCommitFile } from './commit.ts'
import { FileError } from './common.ts'
import { listDirectory, searchFiles, viewFile } from './disk.ts'

const DEFAULT_CONCURRENCY = 4

type Reader = {
  list(path: string): Promise<FileDirectory>
  search(query: string): Promise<FileSearchResult>
  view(path: string): Promise<FileView>
}

// A checked-out branch reads its worktree's disk (uncommitted changes included);
// any other branch reads its latest commit.
const readerFor = (baseDir: string, branch: FileBranch): Reader => {
  const { worktree, commit } = branch
  if (worktree !== null)
    return {
      list: path => listDirectory(worktree, path),
      search: query => searchFiles(worktree, query),
      view: path => viewFile(worktree, path),
    }
  // discoverBranches only yields a branch without a worktree when it has a commit.
  if (commit === null) throw new FileError('branch_not_found', `branch ${branch.name} is empty`)
  return {
    list: path => listCommitDirectory(baseDir, commit, path),
    search: query => searchCommit(baseDir, commit, query),
    view: path => viewCommitFile(baseDir, commit, path),
  }
}

const run = async (baseDir: string, query: FileQuery): Promise<FileReply> => {
  const branches = await discoverBranches(baseDir)
  if (query.op === 'branches') return { ok: true, data: branches }
  // Branches are rediscovered per query; nothing falls back to another branch.
  const branch = branches.find(candidate => candidate.name === query.branch)
  if (!branch) throw new FileError('branch_not_found', `branch ${query.branch} does not exist`)
  const reader = readerFor(baseDir, branch)
  if (query.op === 'list') return { ok: true, data: await reader.list(query.path) }
  if (query.op === 'search') return { ok: true, data: await reader.search(query.query) }
  return { ok: true, data: await reader.view(query.path) }
}

// Answers one read-only query against the Worker directory `baseDir`. Never throws:
// unexpected failures are logged and reported as `unavailable`.
export const handleFileQuery = async (baseDir: string, query: FileQuery): Promise<FileReply> => {
  try {
    return await run(baseDir, query)
  } catch (error) {
    if (error instanceof FileError) return { ok: false, code: error.code, message: error.message }
    console.error(`[files] ${query.op} query failed`, error)
    return { ok: false, code: 'unavailable', message: 'the worker could not complete the read' }
  }
}

// Bounds concurrent queries per daemon (rapid typing can fan out several searches)
// so file reads never crowd the libuv pool the heartbeat and sessions also use.
// Excess queries wait in arrival order.
export const createFileQueryRunner = (
  baseDir: string,
  limit = DEFAULT_CONCURRENCY,
): ((query: FileQuery) => Promise<FileReply>) => {
  let active = 0
  const waiting: (() => void)[] = []
  const acquire = async (): Promise<void> => {
    if (active < limit) {
      active += 1
      return
    }
    await new Promise<void>(resolve => waiting.push(resolve))
  }
  // A released slot passes straight to the next waiter, so `active` stays counted.
  const release = (): void => {
    const next = waiting.shift()
    if (next) next()
    else active -= 1
  }
  return async query => {
    await acquire()
    try {
      return await handleFileQuery(baseDir, query)
    } finally {
      release()
    }
  }
}
