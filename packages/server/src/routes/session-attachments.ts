import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import type { Hono } from 'hono'
import type { AttachmentStore } from '../attachments.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

// RFC 5987 ext-value: encodeURIComponent leaves ' ( ) * literal, but those are
// not attr-chars, so a strict parser can mis-read them (the apostrophe is the
// field delimiter). Percent-encode them too.
const rfc5987 = (s: string): string =>
  encodeURIComponent(s).replace(/['()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

// HTTP header values are latin1 (ByteString) — a non-ASCII filename (e.g. a
// Chinese name) throws when set. ASCII-fold the legacy `filename=` fallback and
// carry the real UTF-8 name in RFC 5987 `filename*`.
const contentDisposition = (filename: string): string => {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'")
  return `inline; filename="${ascii}"; filename*=UTF-8''${rfc5987(filename)}`
}

export const registerSessionAttachmentRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  attachments: AttachmentStore,
): void => {
  // Upload a chat attachment (no auth in v0, like /messages). The raw request
  // body IS the file — streamed straight to disk, no multipart parse, no size
  // cap (the Agent decides what it can handle). filename rides a query param,
  // the file's media type rides content-type. Returns the Attachment descriptor.
  app.post('/sessions/:id/attachments', async c => {
    const sessionId = intParam(c.req.param('id'))
    const session = await store.sessions.get(sessionId)
    if (!session) return c.json({ error: 'not found' }, 404)
    const meta = await attachments.put(sessionId, {
      filename: c.req.query('filename') || 'file',
      contentType: c.req.header('content-type') || 'application/octet-stream',
      body: c.req.raw.body,
    })
    return c.json(meta, 201)
  })

  // Download a stored attachment (no auth in v0). Streamed from disk so large
  // files don't get buffered. Used by the Worker to fetch files into its
  // worktree, and later by the web UI for preview.
  app.get('/sessions/:id/attachments/:attId', async c => {
    const sessionId = intParam(c.req.param('id'))
    const found = await attachments.get(sessionId, c.req.param('attId'))
    if (!found) return c.json({ error: 'not found' }, 404)
    c.header('content-type', found.meta.contentType)
    c.header('content-length', String(found.meta.size))
    c.header('content-disposition', contentDisposition(found.meta.filename))
    const web = Readable.toWeb(createReadStream(found.path)) as ReadableStream<Uint8Array>
    return c.body(web)
  })
}
