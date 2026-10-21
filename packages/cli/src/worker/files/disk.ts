import { constants, type Dirent } from 'node:fs'
import { open, readdir, realpath, stat } from 'node:fs/promises'
import { isAbsolute, join, relative, sep } from 'node:path'
import {
  FILE_DIRECTORY_MAX_ENTRIES,
  FILE_RAW_MAX_BYTES,
  FILE_SEARCH_DEADLINE_MS,
  FILE_SEARCH_MAX_RESULTS,
  FILE_TEXT_MAX_BYTES,
  type FileDirectory,
  type FileEntry,
  type FileSearchResult,
  type FileView,
  imageMediaType,
  isExcludedDirectoryName,
  isSensitiveFilePath,
  rawMediaType,
} from '@baton/shared'
import {
  byKindThenName,
  checkedPath,
  decodeText,
  FileError,
  notFound,
  rawPayload,
  searchNeedle,
} from './common.ts'

const isMissing = (error: unknown): boolean =>
  ['ENOENT', 'ENOTDIR', 'ELOOP'].includes((error as NodeJS.ErrnoException).code ?? '')

const childPath = (parent: string, name: string): string => (parent ? `${parent}/${name}` : name)

// Root-relative '/' path of `real`, or null when it lies outside `root`.
const inside = (root: string, real: string): string | null => {
  const rel = relative(root, real)
  if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`)) return null
  return rel.split(sep).join('/')
}

// A path whose real location escapes the root or lands on a protected file is
// reported as missing, matching how listing hides it.
const resolveInside = async (
  root: string,
  path: string,
  allowRoot: boolean,
): Promise<{ path: string; real: string }> => {
  const rel = checkedPath(path, allowRoot)
  let real: string
  try {
    real = await realpath(join(root, rel))
  } catch (error) {
    if (isMissing(error)) throw notFound(rel)
    throw error
  }
  const target = inside(root, real)
  if (target === null || isSensitiveFilePath(target)) throw notFound(rel)
  return { path: rel, real }
}

// A symlink is shown as its target's kind, and only while the target stays inside
// the root and is not protected.
const symlinkEntry = async (
  root: string,
  linkPath: string,
  name: string,
  path: string,
): Promise<FileEntry | null> => {
  let real: string
  try {
    real = await realpath(linkPath)
  } catch (error) {
    if (!isMissing(error)) console.warn(`[files] cannot resolve symlink ${linkPath}`, error)
    return null
  }
  const target = inside(root, real)
  if (target === null || isSensitiveFilePath(target)) return null
  const info = await stat(real)
  if (info.isDirectory())
    return isExcludedDirectoryName(name) ? null : { name, path, kind: 'directory' }
  return info.isFile() ? { name, path, kind: 'file' } : null
}

const toEntry = async (
  root: string,
  dir: { path: string; real: string },
  dirent: Dirent,
): Promise<FileEntry | null> => {
  const path = childPath(dir.path, dirent.name)
  if (isSensitiveFilePath(path)) return null
  if (dirent.isDirectory())
    return isExcludedDirectoryName(dirent.name)
      ? null
      : { name: dirent.name, path, kind: 'directory' }
  if (dirent.isFile()) return { name: dirent.name, path, kind: 'file' }
  return dirent.isSymbolicLink()
    ? symlinkEntry(root, join(dir.real, dirent.name), dirent.name, path)
    : null
}

// One directory level; never reads file contents.
export const listDirectory = async (root: string, path: string): Promise<FileDirectory> => {
  const dir = await resolveInside(root, path, true)
  if (!(await stat(dir.real)).isDirectory()) throw notFound(dir.path)
  const dirents = await readdir(dir.real, { withFileTypes: true })
  const entries = (await Promise.all(dirents.map(dirent => toEntry(root, dir, dirent))))
    .filter((entry): entry is FileEntry => entry !== null)
    .sort(byKindThenName)
  return {
    path: dir.path,
    entries: entries.slice(0, FILE_DIRECTORY_MAX_ENTRIES),
    truncated: entries.length > FILE_DIRECTORY_MAX_ENTRIES,
  }
}

// Breadth-first, case-insensitive match on the root-relative path of regular files.
// Symlinks are neither followed nor matched, so the walk cannot leave the root.
export const searchFiles = async (
  root: string,
  query: string,
  now: () => number = Date.now,
): Promise<FileSearchResult> => {
  const needle = searchNeedle(query)
  const deadline = now() + FILE_SEARCH_DEADLINE_MS
  const entries: FileEntry[] = []
  const pending = ['']
  for (let index = 0; index < pending.length; index += 1) {
    if (now() > deadline) return { entries, truncated: true }
    const dir = pending[index] ?? ''
    let dirents: Dirent[]
    try {
      dirents = await readdir(join(root, dir), { withFileTypes: true })
    } catch (error) {
      console.warn(`[files] search skipped unreadable directory ${dir || '.'}`, error)
      continue
    }
    for (const dirent of dirents) {
      const path = childPath(dir, dirent.name)
      if (isSensitiveFilePath(path)) continue
      if (dirent.isDirectory()) {
        if (!isExcludedDirectoryName(dirent.name)) pending.push(path)
      } else if (dirent.isFile() && path.toLowerCase().includes(needle)) {
        if (entries.length === FILE_SEARCH_MAX_RESULTS) return { entries, truncated: true }
        entries.push({ name: dirent.name, path, kind: 'file' })
      }
    }
  }
  return { entries, truncated: false }
}

// A regular file's bytes when it holds at most `limit` bytes, else its size. The
// size is checked before anything is read; O_NONBLOCK plus the regular-file checks
// keep a FIFO or device from blocking the read.
const readWithin = async (
  file: { path: string; real: string },
  limit: number,
): Promise<{ bytes: Buffer } | { oversize: number }> => {
  const info = await stat(file.real)
  if (!info.isFile()) throw notFound(file.path)
  if (info.size > limit) return { oversize: info.size }
  const handle = await open(file.real, constants.O_RDONLY | constants.O_NONBLOCK)
  try {
    const opened = await handle.stat()
    if (!opened.isFile()) throw notFound(file.path)
    if (opened.size > limit) return { oversize: opened.size }
    const bytes = await handle.readFile()
    return bytes.length > limit ? { oversize: bytes.length } : { bytes }
  } finally {
    await handle.close()
  }
}

// Text, or image metadata whose bytes come from readRawFile. Oversized files are
// refused from their size alone.
export const viewFile = async (root: string, path: string): Promise<FileView> => {
  const file = await resolveInside(root, path, false)
  const meta = { path: file.path, name: file.path.split('/').at(-1) ?? file.path, commit: null }
  const mediaType = imageMediaType(file.path)
  if (mediaType) {
    const info = await stat(file.real)
    if (!info.isFile()) throw notFound(file.path)
    return info.size > FILE_RAW_MAX_BYTES
      ? { ...meta, size: info.size, kind: 'too_large', limit: FILE_RAW_MAX_BYTES }
      : { ...meta, size: info.size, kind: 'image', mediaType }
  }
  const read = await readWithin(file, FILE_TEXT_MAX_BYTES)
  if ('oversize' in read)
    return { ...meta, size: read.oversize, kind: 'too_large', limit: FILE_TEXT_MAX_BYTES }
  const content = decodeText(read.bytes)
  return content === null
    ? { ...meta, size: read.bytes.length, kind: 'binary' }
    : { ...meta, size: read.bytes.length, kind: 'text', content }
}

// Raw bytes of an image, stylesheet, or font, checked against the type their
// extension claims.
export const readRawFile = async (
  root: string,
  path: string,
): Promise<{ mediaType: string; base64: string }> => {
  const file = await resolveInside(root, path, false)
  const mediaType = rawMediaType(file.path)
  if (!mediaType) throw new FileError('unsupported', `not served raw: ${file.path}`)
  const read = await readWithin(file, FILE_RAW_MAX_BYTES)
  if ('oversize' in read) throw new FileError('unsupported', `too large to serve raw: ${file.path}`)
  return rawPayload(file.path, mediaType, read.bytes)
}
