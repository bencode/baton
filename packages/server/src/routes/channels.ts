import { type Attachment, isMessageFor, type MemberKind } from '@baton/shared'
import type { Context, Hono } from 'hono'
import type { AttachmentStore } from '../attachments.ts'
import type { ChannelBus } from '../channel-bus.ts'
import type { ChannelPresence } from '../channel-presence.ts'
import { streamBus } from '../sse.ts'
import type { Store } from '../store/types.ts'
import type { AppEnv } from '../views.ts'
import { sendAttachment } from './attachment-download.ts'
import { CHANNEL_HELP } from './channel-help.ts'

// Relative path to the protocol doc; clients prepend their own BASE. Returned in
// manifests + create responses so the API is self-describing.
const HELP_PATH = '/channels/help'

// Channel: an N-party live chat room (the multi-agent evolution of the relay).
// Self-authenticating via a per-channel capability token (no cookie/worker/project
// coupling), so these routes register BEFORE the cookie gate. Messages persist
// (store.channels); presence (who's online) is in-memory and ephemeral.

// Bearer token from the Authorization header, or the `?token=` query param as a
// fallback. The query form exists only for the browser EventSource (the web chat
// UI), which cannot set custom headers; agents and fetch clients use the header.
const bearer = (c: Context<AppEnv>): string | null =>
  (c.req.header('authorization') ?? '').match(/^Bearer (.+)$/)?.[1] ?? c.req.query('token') ?? null

const toInt = (raw: string | undefined, dflt: number): number => {
  const n = Number(raw)
  return Number.isFinite(n) ? n : dflt
}

const asKind = (raw: string | undefined): MemberKind => (raw === 'human' ? 'human' : 'agent')

// "Is this message relevant to NAME?" — a broadcast or one addressed to NAME.
// No filtering when `forName` is absent.
const relevantTo =
  (forName: string | undefined) =>
  (m: { to?: string[] }): boolean =>
    !forName || isMessageFor(m, forName)

// Optional JSON body: a missing/malformed body falls back to {}; each handler then
// validates the fields it needs (e.g. text required → 400). Deliberate default, not
// a swallowed error.
const optionalBody = async <T>(c: Context<AppEnv>): Promise<T> =>
  (await c.req.json().catch(() => ({}))) as T

const STREAM_BEAT_MS = 30_000

export const registerChannelRoutes = (
  app: Hono<AppEnv>,
  store: Store,
  bus: ChannelBus,
  presence: ChannelPresence,
  attachments: AttachmentStore,
): void => {
  // The protocol doc (markdown) — no auth, so a freshly-invited agent can read
  // "how to use a channel" with one curl. Registered before /channels/:id so the
  // static path wins over the :id param.
  app.get('/channels/help', c => c.text(CHANNEL_HELP, 200, { 'content-type': 'text/markdown; charset=utf-8' }))

  // Open a fresh room. No auth: the returned token IS the capability, and the id
  // is unguessable — nothing to protect until a channel exists.
  app.post('/channels', async c => {
    const body = await optionalBody<{ title?: string; description?: string }>(c)
    const { channel, token } = await store.channels.create({
      title: body.title,
      description: body.description,
    })
    return c.json({ channelId: channel.id, token, help: HELP_PATH }, 201)
  })

  // Resolve + authorize from the path id and Bearer token. Async: reads the DB.
  // Returns a ready error Response on failure, or null to proceed.
  const guard = async (c: Context<AppEnv>): Promise<Response | null> => {
    const token = bearer(c)
    if (!token) return c.json({ error: 'missing bearer token' }, 401)
    const verdict = await store.channels.auth(c.req.param('id') ?? '', token)
    if (verdict === 'unknown') return c.json({ error: 'channel not found' }, 404)
    if (verdict === 'forbidden') return c.json({ error: 'bad channel token' }, 401)
    return null
  }

  // Room manifest — one-call orientation for a newcomer: self-description + who's
  // online + a pointer to the protocol help.
  app.get('/channels/:id', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const id = c.req.param('id') ?? ''
    const ch = await store.channels.get(id)
    if (!ch) return c.json({ error: 'channel not found' }, 404)
    return c.json({ ...ch, members: presence.list(id), help: HELP_PATH })
  })

  // Update room metadata (title / description = the room's topic / rules). The
  // manifest reflects it immediately; participants re-GET it when they need the
  // current rules (no broadcast).
  app.patch('/channels/:id', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const body = await optionalBody<{ title?: string; description?: string }>(c)
    if (body.title === undefined && body.description === undefined)
      return c.json({ error: 'title or description required' }, 400)
    const ch = await store.channels.update(c.req.param('id') ?? '', body)
    return ch ? c.json(ch) : c.json({ error: 'channel not found' }, 404)
  })

  // Delete a channel: removes the row and cascades its messages. Releases the
  // in-memory roster at once (the bus key self-cleans as subscribers drop off).
  app.delete('/channels/:id', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const id = c.req.param('id') ?? ''
    await store.channels.destroy(id)
    presence.drop(id)
    await attachments.forget(id) // cascade-clean the room's uploaded blobs
    return c.body(null, 204)
  })

  // Claim a name + go online. Names are unique while online: if someone fresh
  // already holds it, 409 so the newcomer picks another (the echo filter + roster
  // are name-keyed — two same-name members would be deaf to each other). Heartbeat
  // is not this call — it rides ?as= on poll/stream, refreshing a name you already
  // hold — so claim-on-JOIN doesn't break keep-alive or reconnect.
  app.put('/channels/:id/members/:name', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const id = c.req.param('id') ?? ''
    const name = c.req.param('name') ?? ''
    if (presence.isOnline(id, name))
      return c.json({ error: 'name taken', members: presence.list(id) }, 409)
    const body = await optionalBody<{ kind?: string }>(c)
    presence.touch(id, name, asKind(body.kind))
    return c.json({ members: presence.list(id) })
  })

  app.delete('/channels/:id/members/:name', async c => {
    const denied = await guard(c)
    if (denied) return denied
    presence.leave(c.req.param('id') ?? '', c.req.param('name') ?? '')
    return c.body(null, 204)
  })

  app.get('/channels/:id/members', async c => {
    const denied = await guard(c)
    if (denied) return denied
    return c.json({ members: presence.list(c.req.param('id') ?? '') })
  })

  app.post('/channels/:id/messages', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const id = c.req.param('id') ?? ''
    const body = await optionalBody<{
      from?: string
      text?: string
      to?: string[]
      senderKind?: string
      attachments?: Attachment[]
    }>(c)
    // A message needs a body: text, attachments, or both.
    if (!body.text && !body.attachments?.length)
      return c.json({ error: 'text or attachments required' }, 400)
    const from = body.from ?? 'peer'
    const senderKind = asKind(body.senderKind)
    const msg = await store.channels.appendMessage(id, {
      sender: from,
      senderKind,
      text: body.text ?? '',
      to: body.to,
      attachments: body.attachments,
    })
    presence.touch(id, from, senderKind) // an active sender stays on the roster
    bus.publish(id, msg) // live fan-out; the DB already has it
    return c.json(msg, 201)
  })

  // curl poll: history strictly after ?since, optionally narrowed to ?for=NAME
  // (broadcasts + messages addressed to NAME). ?as=NAME refreshes presence so a
  // polling-only client stays online without a separate heartbeat.
  app.get('/channels/:id/messages', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const id = c.req.param('id') ?? ''
    const as = c.req.query('as')
    if (as) presence.touch(id, as, asKind(c.req.query('kind')))
    const all = await store.channels.since(id, toInt(c.req.query('since'), 0))
    return c.json({ messages: all.filter(relevantTo(c.req.query('for'))) })
  })

  // Upload an attachment to the room (capability-token auth). The raw body IS the
  // file — streamed to disk, no multipart, no size cap. filename rides ?filename,
  // media type rides content-type. Returns the Attachment descriptor; the sender
  // then cites its `url` in a message so peers can download it.
  app.post('/channels/:id/attachments', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const id = c.req.param('id') ?? ''
    const meta = await attachments.put(
      id,
      {
        filename: c.req.query('filename') || 'file',
        contentType: c.req.header('content-type') || 'application/octet-stream',
        body: c.req.raw.body,
      },
      base => ({ ...base, channelId: id, url: `/channels/${id}/attachments/${base.id}` }),
    )
    return c.json(meta, 201)
  })

  // Download a room attachment (capability-token auth). Streamed from disk so
  // large files don't get buffered.
  app.get('/channels/:id/attachments/:attId', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const found = await attachments.get(c.req.param('id') ?? '', c.req.param('attId') ?? '')
    if (!found) return c.json({ error: 'not found' }, 404)
    return sendAttachment(c, found)
  })

  // SSE: replay seq>since (for-filtered) then tail live. While connected the
  // stream refreshes presence (on open + every 30s), so a listener stays online
  // for free; ?for=NAME limits delivery to broadcasts + messages addressed to it.
  app.get('/channels/:id/stream', async c => {
    const denied = await guard(c)
    if (denied) return denied
    const id = c.req.param('id') ?? ''
    const since = toInt(c.req.query('since'), 0)
    const as = c.req.query('as')
    const kind = asKind(c.req.query('kind'))
    const keep = relevantTo(c.req.query('for'))
    let beat: ReturnType<typeof setInterval> | undefined
    if (as) {
      presence.touch(id, as, kind)
      beat = setInterval(() => presence.touch(id, as, kind), STREAM_BEAT_MS)
      if (typeof beat.unref === 'function') beat.unref()
    }
    return streamBus(
      c,
      push =>
        bus.subscribe(id, m => {
          if (keep(m)) push(m)
        }),
      {
        replay: { load: async () => (await store.channels.since(id, since)).filter(keep), keyOf: m => m.seq },
        onClose: () => {
          if (beat) clearInterval(beat)
        },
      },
    )
  })
}
