import type { Attachment, Id } from '@baton/shared'
import type { AttachmentStore } from '../../attachments.ts'
import { loadScopedSession, sessionAccess } from '../../middleware/domain-scope.ts'
import { deliverMessage } from '../../session-send.ts'
import { intParam } from '../../views.ts'
import type { RegisterSessionGroup } from './helpers.ts'

// The server's own descriptor for an attachment the client references by id, or
// null when it isn't one of THIS session's uploads. The worker downloads `url`
// with its own token, so client-supplied urls / foreign ids never reach the queue.
const storedAttachment = async (
  store: AttachmentStore,
  sessionId: Id,
  claimed: unknown,
): Promise<Attachment | null> => {
  const id = (claimed as { id?: unknown } | null)?.id
  if (typeof id !== 'string') return null
  const found = await store.get(String(sessionId), id)
  return found?.meta.sessionId === sessionId ? found.meta : null
}

export const registerSessionQueue: RegisterSessionGroup = (app, ctx) => {
  app.get('/sessions/:id/queue', async c => {
    const session = await loadScopedSession(c, ctx.store, intParam(c.req.param('id')))
    if (session instanceof Response) return session
    return c.json(await ctx.store.inputs.list(session.id))
  })
  app.delete('/sessions/:id/queue/:inputId', async c => {
    const session = await loadScopedSession(c, ctx.store, intParam(c.req.param('id')))
    if (session instanceof Response) return session
    const result = await ctx.store.inputs.cancel(session.id, intParam(c.req.param('inputId')))
    result.events.forEach(event => {
      ctx.bus.publish(session.id, event)
    })
    return c.json(result.value)
  })
  app.post('/sessions/:id/messages', async c => {
    const session = await loadScopedSession(c, ctx.store, intParam(c.req.param('id')))
    if (session instanceof Response) return session
    if (ctx.terminal.isOpen(session.id))
      return c.json({ error: 'terminal open — use the terminal' }, 409)
    const body = await c.req.json<{
      text?: unknown
      images?: unknown
      attachments?: unknown
      replyExpected?: unknown
    }>()
    const text = typeof body.text === 'string' ? body.text : ''
    const images = Array.isArray(body.images)
      ? body.images.filter((v): v is string => typeof v === 'string')
      : []
    const stored = await Promise.all(
      (Array.isArray(body.attachments) ? body.attachments : []).map(claimed =>
        storedAttachment(ctx.attachments, session.id, claimed),
      ),
    )
    if (stored.includes(null)) return c.json({ error: 'unknown attachment' }, 400)
    const attachments = stored.filter((att): att is Attachment => att !== null)
    if (!text && !images.length && !attachments.length)
      return c.json({ error: 'text, images, or attachments required' }, 400)
    // A share guest may talk to the agent but not drive it: a leading `/` would
    // reach the agent's native commands (/clear, /compact, …).
    if (
      text.trimStart().startsWith('/') &&
      (await sessionAccess(c, ctx.store, session)) === 'share'
    )
      return c.json({ error: 'slash commands are not available via a share link' }, 400)
    if (images.some(v => v.length > 8_000_000)) return c.json({ error: 'image too large' }, 413)
    const replyExpected = body.replyExpected === true
    const sent = await deliverMessage(
      session,
      {
        text,
        images,
        attachments,
        replyExpected,
        // Chat bridges get their answer in the chat, so they are not push recipients.
        senderUserId: replyExpected ? undefined : c.get('userId'),
      },
      ctx,
    )
    if (!sent.delivered) return c.json({ error: 'worker offline — resume unavailable' }, 409)
    return c.json(sent.result, 201)
  })
}
