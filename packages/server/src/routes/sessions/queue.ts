import type { Attachment } from '@baton/shared'
import { loadScopedSession } from '../../middleware/domain-scope.ts'
import { deliverMessage } from '../../session-send.ts'
import { intParam } from '../../views.ts'
import type { RegisterSessionGroup } from './helpers.ts'

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
    const attachments = Array.isArray(body.attachments) ? (body.attachments as Attachment[]) : []
    if (!text && !images.length && !attachments.length)
      return c.json({ error: 'text, images, or attachments required' }, 400)
    if (images.some(v => v.length > 8_000_000)) return c.json({ error: 'image too large' }, 413)
    const sent = await deliverMessage(
      session,
      {
        text,
        images,
        attachments,
        replyExpected: body.replyExpected === true,
      },
      ctx,
    )
    if (!sent.delivered) return c.json({ error: 'worker offline — resume unavailable' }, 409)
    return c.json(sent.result, 201)
  })
}
