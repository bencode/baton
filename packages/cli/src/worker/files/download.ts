import {
  FILE_DOWNLOAD_TIMEOUT_MS,
  type FileBranch,
  type FileDownloadQuery,
  type FileReply,
  type WorkerCommand,
} from '@baton/shared'
import type { FilesClient } from '../../client/files.ts'
import { discoverBranches } from './branches.ts'
import { openCommitDownload } from './commit.ts'
import { type FileDownloadSource, FileError } from './common.ts'
import { openDiskDownload } from './disk.ts'

type FileFailure = Extract<FileReply, { ok: false }>

// Passes the bytes through unchanged, failing the stream as soon as they run past
// the size the source declared, or end short of it.
const exactLength = (size: number): TransformStream<Uint8Array, Uint8Array> => {
  let seen = 0
  return new TransformStream({
    transform(chunk, controller) {
      seen += chunk.byteLength
      if (seen > size) throw new Error(`file grew past its ${size} bytes while downloading`)
      controller.enqueue(chunk)
    },
    flush() {
      if (seen !== size) throw new Error(`file ended at ${seen} of its ${size} bytes`)
    },
  })
}

// Same branch rules as the file queries: a checked-out branch reads its worktree's
// disk, uncommitted changes included; any other branch reads its latest commit.
const openSource = async (
  baseDir: string,
  branch: FileBranch,
  path: string,
  signal: AbortSignal,
): Promise<FileDownloadSource> => {
  if (branch.worktree !== null) return openDiskDownload(branch.worktree, path, signal)
  // discoverBranches only yields a branch without a worktree when it has a commit.
  if (branch.commit === null)
    throw new FileError('branch_not_found', `branch ${branch.name} is empty`)
  return openCommitDownload(baseDir, branch.commit, path, signal)
}

// Branches are rediscovered per download; nothing falls back to another branch.
export const openFileDownload = async (
  baseDir: string,
  query: FileDownloadQuery,
  signal: AbortSignal,
): Promise<FileDownloadSource> => {
  const branches = await discoverBranches(baseDir)
  const branch = branches.find(candidate => candidate.name === query.branch)
  if (!branch) throw new FileError('branch_not_found', `branch ${query.branch} does not exist`)
  const source = await openSource(baseDir, branch, query.path, signal)
  return { ...source, body: source.body.pipeThrough(exactLength(source.size)) }
}

const failureOf = (error: unknown): FileFailure => {
  if (error instanceof FileError) return { ok: false, code: error.code, message: error.message }
  console.error('[files] opening a download failed', error)
  return { ok: false, code: 'unavailable', message: 'the worker could not read the file' }
}

// Answers one download: opens the file and streams it to the server, or reports
// why it cannot be opened. Once the upload has started, a failure only ends it
// (the server fails the browser's download) and is thrown to the caller to log.
export const sendFileDownload = async (
  baseDir: string,
  command: Extract<WorkerCommand, { cmd: 'files.download' }>,
  client: FilesClient,
  signal: AbortSignal,
): Promise<void> => {
  const bounded = AbortSignal.any([signal, AbortSignal.timeout(FILE_DOWNLOAD_TIMEOUT_MS)])
  let source: FileDownloadSource
  try {
    source = await openFileDownload(baseDir, command.query, bounded)
  } catch (error) {
    await client.rejectDownload(command.requestId, failureOf(error))
    return
  }
  try {
    await client.uploadDownload(command.requestId, source.size, source.body, bounded)
  } finally {
    source.close()
  }
}
