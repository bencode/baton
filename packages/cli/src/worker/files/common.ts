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

const hasBytes = (bytes: Buffer, signature: readonly number[], offset = 0): boolean =>
  signature.every((byte, index) => bytes[offset + index] === byte)
const hasText = (bytes: Buffer, text: string, offset = 0): boolean =>
  bytes.subarray(offset, offset + text.length).toString('latin1') === text

const SVG_START = /^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i

// The signature each raw type must carry; an extension alone is not trusted.
const RAW_SIGNATURES: Record<string, (bytes: Buffer) => boolean> = {
  'image/png': bytes => hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/jpeg': bytes => hasBytes(bytes, [0xff, 0xd8, 0xff]),
  'image/gif': bytes => hasText(bytes, 'GIF8'),
  'image/webp': bytes => hasText(bytes, 'RIFF') && hasText(bytes, 'WEBP', 8),
  'image/avif': bytes =>
    hasText(bytes, 'ftyp', 4) && bytes.subarray(8, 32).toString('latin1').includes('avif'),
  'image/bmp': bytes => hasText(bytes, 'BM'),
  'image/x-icon': bytes => hasBytes(bytes, [0x00, 0x00, 0x01, 0x00]),
  'image/svg+xml': bytes => {
    const text = decodeText(bytes)
    return text !== null && SVG_START.test(text.slice(0, 4096))
  },
  'text/css': bytes => decodeText(bytes) !== null,
  'font/woff': bytes => hasText(bytes, 'wOFF'),
  'font/woff2': bytes => hasText(bytes, 'wOF2'),
  'font/ttf': bytes => hasBytes(bytes, [0x00, 0x01, 0x00, 0x00]) || hasText(bytes, 'true'),
  'font/otf': bytes => hasText(bytes, 'OTTO'),
}

// The `raw` reply for a file whose bytes match its type.
export const rawPayload = (
  path: string,
  mediaType: string,
  bytes: Buffer,
): { mediaType: string; base64: string } => {
  if (!RAW_SIGNATURES[mediaType]?.(bytes))
    throw new FileError('unsupported', `not a valid ${mediaType} file: ${path}`)
  return { mediaType, base64: bytes.toString('base64') }
}
