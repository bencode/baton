import type { Hono } from 'hono'
import type { AttachmentStore } from '../attachments.ts'
import { loadScopedSession } from '../middleware/domain-scope.ts'
import type { Store } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'
import { sendAttachment } from './attachment-download.ts'

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
    const session = await loadScopedSession(c, store, sessionId)
    if (session instanceof Response) return session
    const meta = await attachments.put(
      String(sessionId),
      {
        filename: c.req.query('filename') || 'file',
        contentType: c.req.header('content-type') || 'application/octet-stream',
        body: c.req.raw.body,
      },
      base => ({ ...base, sessionId, url: `/sessions/${sessionId}/attachments/${base.id}` }),
    )
    return c.json(meta, 201)
  })

  // Download a stored attachment (no auth in v0). Streamed from disk so large
  // files don't get buffered. Used by the Worker to fetch files into its
  // worktree, and later by the web UI for preview.
  app.get('/sessions/:id/attachments/:attId', async c => {
    const sessionId = intParam(c.req.param('id'))
    const scoped = await loadScopedSession(c, store, sessionId)
    if (scoped instanceof Response) return scoped
    const found = await attachments.get(String(sessionId), c.req.param('attId'))
    if (!found) return c.json({ error: 'not found' }, 404)
    return sendAttachment(c, found)
  })
}
