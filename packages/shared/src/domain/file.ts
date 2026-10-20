// Project Files: read-only, on-demand access to files on a Worker's machine.
// The browser asks the server, the server forwards a `files.query` command over
// the Worker's command stream, and the Worker reads its own disk and reports back.
// Nothing is mirrored or cached server-side. The Worker enforces every rule below;
// the server re-checks request parameters before forwarding.

export const FILE_TEXT_MAX_BYTES = 5 * 1024 * 1024
export const FILE_DIRECTORY_MAX_ENTRIES = 2000
export const FILE_SEARCH_MAX_RESULTS = 500
export const FILE_SEARCH_DEADLINE_MS = 5_000
export const FILE_SEARCH_QUERY_MAX_LENGTH = 200

// A browsable branch of the Worker's repository. Git checks a branch out in at
// most one worktree, so the branch name alone addresses that worktree; files are
// addressed as worker + branch + repository-relative path.
export type FileBranch = {
  name: string
  // The worktree directory on the Worker, for display only.
  path: string
  // The worktree that is the Worker daemon's own directory.
  current: boolean
}

export type FileEntry = { name: string; path: string; kind: 'directory' | 'file' }
export type FileDirectory = { path: string; entries: FileEntry[]; truncated: boolean }
export type FileSearchResult = { entries: FileEntry[]; truncated: boolean }

type FileMeta = { path: string; name: string; size: number }
export type FileView =
  | (FileMeta & { kind: 'text'; content: string })
  | (FileMeta & { kind: 'binary' })
  | (FileMeta & { kind: 'too_large'; limit: number })

export type FileQuery =
  | { op: 'branches' }
  | { op: 'list'; branch: string; path: string }
  | { op: 'search'; branch: string; query: string }
  | { op: 'view'; branch: string; path: string }

export type FileQueryData = {
  branches: FileBranch[]
  list: FileDirectory
  search: FileSearchResult
  view: FileView
}

export type FileErrorCode =
  | 'invalid_request'
  | 'forbidden_path'
  | 'branch_not_found'
  | 'file_not_found'
  | 'unavailable'
  | 'worker_offline'
  | 'worker_timeout'

export type FileReply<Op extends FileQuery['op'] = FileQuery['op']> =
  | { ok: true; data: FileQueryData[Op] }
  | { ok: false; code: FileErrorCode; message: string }

export type FileQueryResult = { requestId: string } & FileReply

export const FILE_ERROR_STATUS: Record<FileErrorCode, 400 | 403 | 404 | 409 | 502 | 504> = {
  invalid_request: 400,
  forbidden_path: 403,
  branch_not_found: 404,
  file_not_found: 404,
  worker_offline: 409,
  unavailable: 502,
  worker_timeout: 504,
}

export const isFileErrorCode = (value: unknown): value is FileErrorCode =>
  typeof value === 'string' && Object.hasOwn(FILE_ERROR_STATUS, value)

// A sanity bound only: the Worker matches the name exactly against its checked-out
// branches, which is the real check.
export const isBranchName = (value: string): boolean =>
  value.length > 0 &&
  value.length <= 255 &&
  [...value].every(char => char.charCodeAt(0) > 0x1f && char.charCodeAt(0) !== 0x7f)

// A root-relative path with '/' separators: no absolute paths, drive letters,
// backslashes, NUL, or empty / '.' / '..' segments. '' (the root itself) only
// when `allowRoot`.
export const normalizeFilePath = (value: string, allowRoot = false): string | null => {
  if (value === '') return allowRoot ? '' : null
  if (value.includes('\0') || value.includes('\\') || value.startsWith('/')) return null
  if (/^[A-Za-z]:/.test(value)) return null
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
    ? value
    : null
}

const SENSITIVE_SEGMENTS = new Set(['.git', '.ssh', '.aws', '.kube', '.gnupg'])
const SENSITIVE_NAMES = new Set([
  '.baton.json',
  '.envrc',
  '.npmrc',
  '.netrc',
  '.pypirc',
  '.git-credentials',
  '.pgpass',
  '.htpasswd',
  '.credentials.json',
])
const SENSITIVE_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx', '.jks', '.keystore']

const isSensitiveName = (name: string): boolean =>
  SENSITIVE_NAMES.has(name) ||
  (/^\.env(\..+)?$/.test(name) && !/\.(example|sample|template)$/.test(name)) ||
  /^id_(rsa|dsa|ecdsa|ed25519)$/.test(name) ||
  SENSITIVE_EXTENSIONS.some(extension => name.endsWith(extension))

// Credentials and Git internals: never listed, searched, or read.
export const isSensitiveFilePath = (path: string): boolean => {
  const segments = path.toLowerCase().split('/')
  return (
    segments.some(segment => SENSITIVE_SEGMENTS.has(segment)) ||
    isSensitiveName(segments.at(-1) ?? '')
  )
}

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.pnpm-store',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.venv',
  '__pycache__',
  'target',
])

// Dependency and build output: hidden from listing and search, still readable by path.
export const isExcludedDirectoryName = (name: string): boolean => EXCLUDED_DIRECTORIES.has(name)
