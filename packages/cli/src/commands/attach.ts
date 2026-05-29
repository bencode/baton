import { openAsBlob } from 'node:fs'
import { basename } from 'node:path'
import type { Attachment, Id } from '@baton/shared'
import type { ApiClient } from '../client.ts'
import { contentTypeForPath } from '../mime.ts'

// Normalize the `--attach` flag into a path list. citty collapses a repeated
// string flag to its last value, so CSV (`--attach a.png,b.pdf`) is the escape
// hatch for multiple files; an array (if citty yields one) is handled too.
export const attachPaths = (raw: string | string[] | undefined): string[] =>
  (raw === undefined ? [] : Array.isArray(raw) ? raw : [raw])
    .flatMap(p => p.split(','))
    .map(p => p.trim())
    .filter(Boolean)

// Read each file and upload it to the session; returns the descriptors to embed
// in the outgoing message so the Worker can fetch them before its turn.
export const uploadAttachments = async (
  client: ApiClient,
  sessionId: Id,
  paths: string[],
): Promise<Attachment[]> => {
  const out: Attachment[] = []
  for (const path of paths) {
    // openAsBlob is lazy/file-backed — uploads stream from disk, never fully buffered.
    const body = await openAsBlob(path, { type: contentTypeForPath(path) })
    out.push(
      await client.sessions.uploadAttachment(sessionId, {
        filename: basename(path),
        contentType: contentTypeForPath(path),
        body,
      }),
    )
  }
  return out
}
