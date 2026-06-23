import type { Id } from '@baton/shared'
import type { Hono } from 'hono'
import { nextRunAfter } from '../loop-scheduler.ts'
import { loadScopedSession } from '../middleware/domain-scope.ts'
import type { ProjectBus } from '../project-bus.ts'
import type { LoopPatch, Store } from '../store/types.ts'
import { type AppEnv, intParam } from '../views.ts'

// The scheduler ticks at ~30s, so a sub-30s interval can't actually fire faster;
// floor at 30s to keep loops meaningful (and off the "every second" footgun).
const MIN_INTERVAL_SEC = 30
// Ceiling well clear of Date-ms overflow (nextRunAt = now + intervalSec*1000 must
// stay a valid Date); 90 days is generous for any recurring wake-up.
const MAX_INTERVAL_SEC = 90 * 86_400

// Validate a raw interval — required on create, optional on patch. Floors to whole
// seconds; rejects non-numbers, sub-floor, and absurd values that would overflow
// the next-run timestamp. Returns the clean value or a client-facing error string.
const checkInterval = (v: unknown): { value: number } | { error: string } => {
  if (typeof v !== 'number' || !Number.isFinite(v))
    return { error: `intervalSec must be a number ≥ ${MIN_INTERVAL_SEC}` }
  const n = Math.floor(v)
  if (n < MIN_INTERVAL_SEC) return { error: `intervalSec must be a number ≥ ${MIN_INTERVAL_SEC}` }
  if (n > MAX_INTERVAL_SEC) return { error: `intervalSec must be ≤ ${MAX_INTERVAL_SEC} (90d)` }
  return { value: n }
}

const cleanName = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined

// CRUD for Loops (recurring scheduled wake-ups). Loops hang off a Session and are
// scoped through it (loadScopedSession enforces workspace access). Mutations bump
// the project stream with { resource: 'loops' } so open clients refetch.
export const registerLoopRoutes = (app: Hono<AppEnv>, store: Store, projects: ProjectBus): void => {
  const bump = (projectId: Id) => projects.publish(projectId, { resource: 'loops' })

  app.post('/sessions/:id/loops', async c => {
    const sessionId = intParam(c.req.param('id'))
    const session = await loadScopedSession(c, store, sessionId)
    if (session instanceof Response) return session
    const body = (await c.req.json()) as {
      name?: unknown
      message?: unknown
      intervalSec?: unknown
      enabled?: unknown
    }
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    if (message.length === 0) return c.json({ error: 'message required' }, 400)
    const iv = checkInterval(body.intervalSec)
    if ('error' in iv) return c.json({ error: iv.error }, 400)
    const loop = await store.loops.create({
      sessionId,
      name: cleanName(body.name),
      message,
      intervalSec: iv.value,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
      // First beat is one interval out — creating a loop never fires immediately.
      nextRunAt: nextRunAfter(Date.now(), iv.value),
    })
    bump(session.projectId)
    return c.json(loop, 201)
  })

  app.get('/sessions/:id/loops', async c => {
    const sessionId = intParam(c.req.param('id'))
    const session = await loadScopedSession(c, store, sessionId)
    if (session instanceof Response) return session
    return c.json(await store.loops.listBySession(sessionId))
  })

  app.get('/loops/:id', async c => {
    const loop = await store.loops.get(intParam(c.req.param('id')))
    if (!loop) return c.json({ error: 'not found' }, 404)
    const scoped = await loadScopedSession(c, store, loop.sessionId)
    if (scoped instanceof Response) return scoped
    return c.json(loop)
  })

  app.patch('/loops/:id', async c => {
    const id = intParam(c.req.param('id'))
    const loop = await store.loops.get(id)
    if (!loop) return c.json({ error: 'not found' }, 404)
    const session = await loadScopedSession(c, store, loop.sessionId)
    if (session instanceof Response) return session
    const body = (await c.req.json()) as {
      name?: unknown
      message?: unknown
      intervalSec?: unknown
      enabled?: unknown
    }
    const patch: LoopPatch = {}
    if (typeof body.name === 'string') patch.name = body.name.trim() || null
    else if (body.name === null) patch.name = null
    if (typeof body.message === 'string') {
      const m = body.message.trim()
      if (m.length === 0) return c.json({ error: 'message cannot be empty' }, 400)
      patch.message = m
    }
    // Re-anchor the next beat when the interval changes or the loop is (re)enabled,
    // so a stale past nextRunAt can't make it fire the instant it's turned back on.
    let reanchor = false
    if (typeof body.intervalSec === 'number') {
      const iv = checkInterval(body.intervalSec)
      if ('error' in iv) return c.json({ error: iv.error }, 400)
      patch.intervalSec = iv.value
      reanchor = true
    }
    if (typeof body.enabled === 'boolean') {
      patch.enabled = body.enabled
      if (body.enabled) reanchor = true
    }
    if (reanchor) patch.nextRunAt = nextRunAfter(Date.now(), patch.intervalSec ?? loop.intervalSec)
    const updated = await store.loops.update(id, patch)
    bump(session.projectId)
    return c.json(updated)
  })

  app.delete('/loops/:id', async c => {
    const id = intParam(c.req.param('id'))
    const loop = await store.loops.get(id)
    if (!loop) return c.json({ error: 'not found' }, 404)
    const session = await loadScopedSession(c, store, loop.sessionId)
    if (session instanceof Response) return session
    await store.loops.delete(id)
    bump(session.projectId)
    return c.body(null, 204)
  })
}
