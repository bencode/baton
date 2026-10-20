import {
  FILE_SEARCH_QUERY_MAX_LENGTH,
  type FileEntry,
  type FileErrorCode,
  isSensitiveFilePath,
  normalizeFilePath,
} from '@baton/shared'

// Rules shared by the worktree (disk) and commit readers.

// An expected, client-facing outcome of a file query; anything else thrown while
// reading is unexpected and reported as `unavailable`.
export class FileError extends Error {
  constructor(
    readonly code: FileErrorCode,
    message: string,
  ) {
    super(message)
  }
}

export const notFound = (path: string): FileError =>
  new FileError('file_not_found', `not found: ${path}`)

// A requested repository-relative path: well-formed and not protected.
export const checkedPath = (path: string, allowRoot: boolean): string => {
  const rel = normalizeFilePath(path, allowRoot)
  if (rel === null) throw new FileError('invalid_request', `invalid path: ${path}`)
  if (isSensitiveFilePath(rel)) throw new FileError('forbidden_path', `protected file: ${rel}`)
  return rel
}

// The lower-cased search term, or invalid_request when blank or too long.
export const searchNeedle = (query: string): string => {
  const trimmed = query.trim()
  if (trimmed === '' || trimmed.length > FILE_SEARCH_QUERY_MAX_LENGTH)
    throw new FileError(
      'invalid_request',
      `search query must be 1-${FILE_SEARCH_QUERY_MAX_LENGTH} characters`,
    )
  return trimmed.toLowerCase()
}

export const byKindThenName = (a: FileEntry, b: FileEntry): number => {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

// Text unless the bytes contain NUL or are not valid UTF-8.
export const decodeText = (bytes: Buffer): string | null => {
  if (bytes.includes(0)) return null
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch (error) {
    if (error instanceof TypeError) return null
    throw error
  }
}
