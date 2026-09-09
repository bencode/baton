import type { AttemptResult, Session, SessionEvent } from '@baton/shared'
import type { Context } from 'hono'
import { ExecutionConflict } from '../../store/types.ts'
import type { AppEnv } from '../../views.ts'
import type { RegisterSessionGroup, SessionRouteCtx } from './helpers.ts'

export const publishExecution = (
  ctx: SessionRouteCtx,
  session: Session,
  events: SessionEvent[],
): void => {
  events.forEach(event => {
    ctx.bus.publish(session.id, event)
    if (event.type === 'turn_start') ctx.busyTracker.open(session.id)
    if (['turn_complete', 'turn_error', 'turn_aborted'].includes(event.type))
      ctx.busyTracker.close(session.id)
    if (event.type === 'turn_complete') ctx.publishTitle(session)
  })
  ctx.bump(session.projectId)
}

export const controlExecution = async (
  ctx: SessionRouteCtx,
  session: Session,
  action: 'interrupt' | 'session_stop' | 'context_clear' | 'resume',
) => {
  const result = await ctx.store.turns.control(session.id, action)
  publishExecution(ctx, session, result.events)
  ctx.commands.publish(session.workerId, { cmd: 'session.reconcile', sessionId: session.id })
  return result.value
}

class InvalidExecutionInput extends Error {}

const requestBody = async (c: Context<AppEnv>): Promise<Record<string, unknown>> => {
  const value: unknown = await c.req.json()
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new InvalidExecutionInput('JSON object required')
  return value as Record<string, unknown>
}

const attemptId = (c: Context<AppEnv>): number => {
  const value = Number(c.req.param('attemptId'))
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new InvalidExecutionInput('invalid attemptId')
  return value
}

const stringField = (body: Record<string, unknown>, key: string): string => {
  const value = body[key]
  if (typeof value !== 'string' || !value || value.length > 200)
    throw new InvalidExecutionInput(`invalid ${key}`)
  return value
}

export const registerSessionTurns: RegisterSessionGroup = (app, ctx) => {
  const handle =
    (fn: (c: Context<AppEnv>, session: Session) => Promise<Response>) =>
    async (c: Context<AppEnv>): Promise<Response> => {
      const owned = await ctx.ownedByWorker(c)
      if (owned.error) return owned.error
      try {
        return await fn(c, owned.session)
      } catch (error) {
        if (error instanceof ExecutionConflict) return c.json({ error: error.message }, 409)
        if (error instanceof InvalidExecutionInput || error instanceof SyntaxError)
          return c.json({ error: error.message }, 400)
        throw error
      }
    }
  app.get(
    '/sessions/:id/execution',
    ctx.auth,
    handle(async (c, session) => c.json(await ctx.store.turns.state(session.id))),
  )
  app.post(
    '/sessions/:id/turns/claim',
    ctx.auth,
    handle(async (c, session) => {
      const body = await requestBody(c)
      if (ctx.terminal.isOpen(session.id)) return c.json({ error: 'terminal open' }, 409)
      const result = await ctx.store.turns.claim(session.id, {
        claimId: stringField(body, 'claimId'),
        runnerToken: stringField(body, 'runnerToken'),
      })
      publishExecution(ctx, session, result.events)
      return c.json(result.value)
    }),
  )
  app.post(
    '/sessions/:id/attempts/:attemptId/events',
    ctx.auth,
    handle(async (c, session) => {
      const body = await requestBody(c)
      if (body.type !== 'agent_event' && body.type !== 'sdk_event')
        return c.json({ error: 'only agent_event/sdk_event accepted' }, 400)
      const result = await ctx.store.turns.event(
        session.id,
        attemptId(c),
        stringField(body, 'runnerToken'),
        body.type,
        body.payload ?? null,
      )
      result.events.forEach(event => {
        ctx.bus.publish(session.id, event)
      })
      return c.json(result.value, 201)
    }),
  )
  app.post(
    '/sessions/:id/attempts/:attemptId/heartbeat',
    ctx.auth,
    handle(async (c, session) => {
      const body = await requestBody(c)
      const result = await ctx.store.turns.heartbeat(
        session.id,
        attemptId(c),
        stringField(body, 'runnerToken'),
        body.stopReason === 'timeout' ? 'timeout' : undefined,
      )
      if (!result.abortRequested) ctx.busyTracker.open(session.id)
      return c.json(result)
    }),
  )
  app.post(
    '/sessions/:id/attempts/:attemptId/finish',
    ctx.auth,
    handle(async (c, session) => {
      const body = await requestBody(c)
      if (!['completed', 'failed', 'aborted'].includes(String(body.outcome)))
        return c.json({ error: 'invalid outcome' }, 400)
      const result = await ctx.store.turns.finish(session.id, attemptId(c), {
        runnerToken: stringField(body, 'runnerToken'),
        outcome: body.outcome as AttemptResult['outcome'],
        ...(typeof body.message === 'string' ? { message: body.message } : {}),
        ...(typeof body.subtype === 'string' ? { subtype: body.subtype } : {}),
      })
      publishExecution(ctx, session, result.events)
      return c.json(result.value)
    }),
  )
  app.post(
    '/sessions/:id/attempts/:attemptId/stopped',
    ctx.auth,
    handle(async (c, session) => {
      const body = await requestBody(c)
      const result = await ctx.store.turns.stopped(
        session.id,
        attemptId(c),
        stringField(body, 'runnerToken'),
      )
      publishExecution(ctx, session, result.events)
      return c.json(result.value)
    }),
  )
  app.post(
    '/sessions/:id/attempts/:attemptId/materialize',
    ctx.auth,
    handle(async (c, session) => {
      const body = await requestBody(c)
      await ctx.store.turns.materialize(
        session.id,
        attemptId(c),
        stringField(body, 'runnerToken'),
        stringField(body, 'agentSessionId'),
      )
      return c.body(null, 204)
    }),
  )
}
