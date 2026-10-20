import type { FileQuery, FileReply } from '@baton/shared'
import { FileError, listDirectory, searchFiles, viewFile } from './disk.ts'
import { discoverRoots } from './roots.ts'

const DEFAULT_CONCURRENCY = 4

const run = async (baseDir: string, query: FileQuery): Promise<FileReply> => {
  const roots = await discoverRoots(baseDir)
  if (query.op === 'roots') return { ok: true, data: roots }
  // Roots are rediscovered per query, so a removed worktree stops resolving instead
  // of falling back to a same-named file elsewhere.
  const root = roots.find(candidate => candidate.id === query.rootId)
  if (!root) throw new FileError('root_not_found', `directory ${query.rootId} is not available`)
  if (query.op === 'list') return { ok: true, data: await listDirectory(root.path, query.path) }
  if (query.op === 'search') return { ok: true, data: await searchFiles(root.path, query.query) }
  return { ok: true, data: await viewFile(root.path, query.path) }
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
