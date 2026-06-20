import { randomUUID } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { Attachment } from '@baton/shared'

// Transient filesystem blob store for chat attachments. Deliberately NOT in
// Prisma: baton's model only carries references, and the server is a real-time
// relay, not a content store. These bytes exist only long enough to ferry a
// file across to a (possibly remote) Worker or channel peer; they're
// cascade-cleaned when the owning session/channel is destroyed.
//
// Bytes are streamed straight to/from disk (no full-file buffering) so large
// uploads/downloads stay cheap — size is the Agent's concern, not ours.
//
// `scope` is the owner key — a session id or a channel id, stringified. The
// caller supplies `makeMeta` to stamp the scope-specific fields (sessionId vs
// channelId + the download url) onto the descriptor the store persists.
// Layout: <rootDir>/<scope>/<id>/blob + <rootDir>/<scope>/<id>/meta.json
export type AttachmentBase = {
  id: string
  filename: string
  contentType: string
  size: number
  createdAt: number
}
export type AttachmentStore = {
  put(
    scope: string,
    input: { filename: string; contentType: string; body: ReadableStream<Uint8Array> | null },
    makeMeta: (base: AttachmentBase) => Attachment,
  ): Promise<Attachment>
  get(scope: string, id: string): Promise<{ meta: Attachment; path: string } | null>
  forget(scope: string): Promise<void>
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
  const dirOf = (scope: string, id: string): string => join(rootDir, scope, id)
  return {
    async put(scope, input, makeMeta) {
      const id = randomUUID()
      const dir = dirOf(scope, id)
      await mkdir(dir, { recursive: true })
      const blobPath = join(dir, 'blob')
      if (input.body) await pipeline(Readable.fromWeb(input.body), createWriteStream(blobPath))
      else await writeFile(blobPath, new Uint8Array())
      const { size } = await stat(blobPath)
      const meta = makeMeta({
        id,
        filename: sanitizeFilename(input.filename),
        contentType: input.contentType,
        size,
        createdAt: Date.now(),
      })
      await writeFile(join(dir, 'meta.json'), JSON.stringify(meta), 'utf8')
      return meta
    },
    async get(scope, id) {
      const dir = dirOf(scope, id)
      try {
        const meta = JSON.parse(await readFile(join(dir, 'meta.json'), 'utf8')) as Attachment
        return { meta, path: join(dir, 'blob') }
      } catch {
        return null
      }
    },
    async forget(scope) {
      // Best-effort cleanup on destroy; a missing or already-removed dir is fine.
      await rm(join(rootDir, scope), { recursive: true, force: true }).catch(() => {})
    },
  }
}
