import type { SessionEvent } from '@baton/shared'
import { loadScopedSession } from '../../middleware/domain-scope.ts'
import { streamBus } from '../../sse.ts'
import { intParam } from '../../views.ts'
import type { RegisterSessionGroup } from './helpers.ts'

const numQuery = (value: string | undefined): number | undefined => {
  if (!value) return undefined
  const number = Number(value)
  return Number.isFinite(number) ? number : undefined
}

export const registerSessionIo: RegisterSessionGroup = (app, { store, bus }) => {
  // Transcript history (persisted log) as a plain JSON list. The web loads a
  // bounded window on open instead of the whole transcript (long sessions reach
  // multiple MB). `?limit=<n>` returns the most recent n events; add `?before=<seq>`
  // to page older ones ("load earlier"). `?since=<seq>` (no limit) returns events
  // at/after a sequence — used by the SSE-reconnect/bridge backfill, kept as-is.
  // Gated like other reads.
  app.get('/sessions/:id/events', async c => {
    const id = intParam(c.req.param('id'))
    const exists = await loadScopedSession(c, store, id)
    if (exists instanceof Response) return exists
    const limit = numQuery(c.req.query('limit'))
    if (limit !== undefined) {
      const before = numQuery(c.req.query('before'))
      return c.json(await store.sessions.listEventWindow(id, { before, limit }))
    }
    const since = numQuery(c.req.query('since'))
    const all = await store.sessions.listEvents(id)
    return c.json(since !== undefined ? all.filter(e => e.sequence >= since) : all)
  })

  // Transcript stream: replays the persisted log then tails live. `?live=1` skips
  // the replay (the web now loads history via GET above and only tails live here;
  // the worker child also uses ?live=1 so a resume doesn't re-run past messages).
  // `?since=<seq>` bounds the replay to events at/after a sequence — the DingTalk
  // bridge passes its message's sequence so it doesn't re-read the whole history.
  app.get('/sessions/:id/stream', async c => {
    const id = intParam(c.req.param('id'))
    const exists = await loadScopedSession(c, store, id)
    if (exists instanceof Response) return exists
    const live = c.req.query('live') === '1'
    const since = Number(c.req.query('since'))
    const load = async (): Promise<SessionEvent[]> => {
      const all = await store.sessions.listEvents(id)
      return Number.isFinite(since) ? all.filter(e => e.sequence >= since) : all
    }
    return streamBus<SessionEvent>(c, push => bus.subscribe(id, push), {
      ...(live ? {} : { replay: { load, keyOf: e => e.id } }),
    })
  })
}
