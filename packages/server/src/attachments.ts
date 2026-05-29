import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Attachment, Id } from '@baton/shared'

// Transient filesystem blob store for chat attachments. Deliberately NOT in
// Prisma: baton's model only carries references, and the server is a real-time
// relay, not a content store. These bytes exist only long enough to ferry a
// file across to a (possibly remote) Worker; they're cascade-cleaned when the
// session is destroyed.
//
// Bytes are streamed straight to/from disk (no full-file buffering) so large
// uploads/downloads stay cheap — size is the Agent's concern, not ours.
//
// Layout: <rootDir>/<sessionId>/<id>/blob + <rootDir>/<sessionId>/<id>/meta.json
export type AttachmentStore = {
  put(
    sessionId: Id,
    input: { filename: string; contentType: string; body: ReadableStream<Uint8Array> | null },
  ): Promise<Attachment>
  get(sessionId: Id, id: string): Promise<{ meta: Attachment; path: string } | null>
  forgetSession(sessionId: Id): Promise<void>
}

export const defaultAttachmentDir = (env: NodeJS.ProcessEnv = process.env): string =>
  env.BATON_DATA_DIR
    ? join(env.BATON_DATA_DIR, 'attachments')
    : join(env.XDG_DATA_HOME ?? join(env.HOME ?? homedir(), '.local/share'), 'baton', 'attachments')

// Strip any path components / traversal; keep a plain, safe filename.
const sanitizeFilename = (name: string): string => {
  const base = basename(name).replace(/[/\\]/g, '_').trim()
  return base.length > 0 ? base : 'file'
}

export const createAttachmentStore = (rootDir: string): AttachmentStore => {
  const dirOf = (sessionId: Id, id: string): string => join(rootDir, String(sessionId), id)
  return {
    async put(sessionId, input) {
      const id = randomUUID()
      const dir = dirOf(sessionId, id)
      await mkdir(dir, { recursive: true })
      const blobPath = join(dir, 'blob')
      if (input.body) await pipeline(Readable.fromWeb(input.body), createWriteStream(blobPath))
      else await writeFile(blobPath, new Uint8Array())
      const { size } = await stat(blobPath)
      const meta: Attachment = {
        id,
        sessionId,
        filename: sanitizeFilename(input.filename),
        contentType: input.contentType,
        size,
        url: `/sessions/${sessionId}/attachments/${id}`,
        createdAt: Date.now(),
      }
      await writeFile(join(dir, 'meta.json'), JSON.stringify(meta), 'utf8')
      return meta
    },
    async get(sessionId, id) {
      const dir = dirOf(sessionId, id)
      try {
        const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as Attachment
        return { meta, path: join(dir, 'blob') }
      } catch {
        return null
      }
    },
    async forgetSession(sessionId) {
      await rm(join(rootDir, String(sessionId)), { recursive: true, force: true }).catch(() => {})
    },
  }
}
