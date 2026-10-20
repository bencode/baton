import {
  FILE_DIRECTORY_MAX_ENTRIES,
  FILE_SEARCH_MAX_RESULTS,
  FILE_TEXT_MAX_BYTES,
  type FileDirectory,
  type FileEntry,
  type FileSearchResult,
  type FileView,
  isExcludedDirectoryName,
  isSensitiveFilePath,
} from '@baton/shared'
import { runGit } from './branches.ts'
import {
  byKindThenName,
  checkedPath,
  decodeText,
  FileError,
  notFound,
  searchNeedle,
} from './disk.ts'

// Committed content of a branch with no worktree, read straight from Git objects:
// nothing is checked out and no worktree, index, or HEAD is touched. Git trees
// hold no real directories to escape through, so only regular files are shown;
// symlinks and submodules are skipped.

const MISSING_OBJECT_EXIT = 128
const SEARCH_MAX_OUTPUT = 64 * 1024 * 1024
const REGULAR_FILE_MODES = new Set(['100644', '100755'])

type TreeEntry = { mode: string; type: string; oid: string; size: number | null; path: string }

// `git ls-tree -z [-l]` records: "<mode> <type> <oid>[ <padded size>]\t<path>".
const parseTree = (stdout: Buffer): TreeEntry[] =>
  stdout
    .toString('utf8')
    .split('\0')
    .flatMap(record => {
      const tab = record.indexOf('\t')
      if (tab < 0) return []
      const [mode = '', type = '', oid = '', size = ''] = record.slice(0, tab).split(/ +/)
      const bytes = /^\d+$/.test(size) ? Number(size) : null
      return [{ mode, type, oid, size: bytes, path: record.slice(tab + 1) }]
    })

const isRegularFile = (entry: TreeEntry): boolean =>
  entry.type === 'blob' && REGULAR_FILE_MODES.has(entry.mode)

// null when the tree-ish does not exist or is not a tree (git exits 128).
const lsTree = async (repo: string, args: string[]): Promise<TreeEntry[] | null> => {
  try {
    return parseTree(await runGit(repo, ['ls-tree', '-z', ...args]))
  } catch (error) {
    if ((error as { code?: unknown }).code === MISSING_OBJECT_EXIT) return null
    throw error
  }
}

export const listCommitDirectory = async (
  repo: string,
  commit: string,
  path: string,
): Promise<FileDirectory> => {
  const rel = checkedPath(path, true)
  const children = await lsTree(repo, [`${commit}:${rel}`])
  if (children === null) throw notFound(rel || '.')
  const entries = children
    .flatMap((entry): FileEntry[] => {
      const child = rel ? `${rel}/${entry.path}` : entry.path
      if (isSensitiveFilePath(child)) return []
      if (entry.type === 'tree')
        return isExcludedDirectoryName(entry.path)
          ? []
          : [{ name: entry.path, path: child, kind: 'directory' }]
      return isRegularFile(entry) ? [{ name: entry.path, path: child, kind: 'file' }] : []
    })
    .sort(byKindThenName)
  return {
    path: rel,
    entries: entries.slice(0, FILE_DIRECTORY_MAX_ENTRIES),
    truncated: entries.length > FILE_DIRECTORY_MAX_ENTRIES,
  }
}

export const searchCommit = async (
  repo: string,
  commit: string,
  query: string,
): Promise<FileSearchResult> => {
  const needle = searchNeedle(query)
  let stdout: Buffer
  try {
    stdout = await runGit(repo, ['ls-tree', '-r', '-z', commit], SEARCH_MAX_OUTPUT)
  } catch (error) {
    if ((error as { code?: unknown }).code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER')
      throw new FileError('unavailable', 'the branch has too many files to search')
    throw error
  }
  const matches = parseTree(stdout).filter(
    entry =>
      isRegularFile(entry) &&
      !entry.path.split('/').slice(0, -1).some(isExcludedDirectoryName) &&
      !isSensitiveFilePath(entry.path) &&
      entry.path.toLowerCase().includes(needle),
  )
  return {
    entries: matches.slice(0, FILE_SEARCH_MAX_RESULTS).map(entry => ({
      name: entry.path.split('/').at(-1) ?? entry.path,
      path: entry.path,
      kind: 'file',
    })),
    truncated: matches.length > FILE_SEARCH_MAX_RESULTS,
  }
}

// Text only; an oversized blob is refused from its recorded size without reading it.
export const viewCommitFile = async (
  repo: string,
  commit: string,
  path: string,
): Promise<FileView> => {
  const rel = checkedPath(path, false)
  const entry = (await lsTree(repo, ['-l', commit, '--', rel]))?.find(item => item.path === rel)
  if (!entry || !isRegularFile(entry) || entry.size === null) throw notFound(rel)
  const meta = { path: rel, name: rel.split('/').at(-1) ?? rel, commit }
  if (entry.size > FILE_TEXT_MAX_BYTES)
    return { ...meta, size: entry.size, kind: 'too_large', limit: FILE_TEXT_MAX_BYTES }
  const bytes = await runGit(repo, ['cat-file', 'blob', entry.oid], FILE_TEXT_MAX_BYTES + 1)
  const content = decodeText(bytes)
  return content === null
    ? { ...meta, size: bytes.length, kind: 'binary' }
    : { ...meta, size: bytes.length, kind: 'text', content }
}
