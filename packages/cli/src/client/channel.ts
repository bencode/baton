import type {
  Attachment,
  Channel,
  ChannelManifest,
  ChannelMember,
  ChannelMessage,
  MemberKind,
} from '@baton/shared'
import { EventSource } from 'eventsource'

export type ChannelHandle = { channelId: string; token: string; help?: string }

export type SendInput = {
  from: string
  text: string
  to?: string[]
  senderKind?: MemberKind
  attachments?: Attachment[]
}

export type ListenOpts = {
  // Replay history strictly after this seq (0 = full history for a late joiner).
  since?: number
  // Only broadcasts + messages addressed to this name (server-side filter).
  for?: string
  // Your participant name. Sent as ?as= so the open stream keeps your presence
  // fresh server-side — a listening agent stays online for free.
  as?: string
  onMessage: (m: ChannelMessage) => void
  onError?: (e: unknown) => void
}

// Channel client. Like the relay client, deliberately independent of the shared
// `request` helper / cookie gate: a channel authenticates only with its own token,
// passed explicitly per call — a self-contained capability auth domain.
export type ChannelClient = {
  // Create a room in a workspace. Membership-gated, so it carries a baton Bearer
  // token (resolveBearer) — unlike the channel-token calls below.
  create(
    workspaceId: number,
    title?: string,
    description?: string,
    token?: string,
  ): Promise<ChannelHandle>
  // One-call room manifest: description + online roster + help pointer.
  manifest(channelId: string, token: string): Promise<ChannelManifest>
  // Update room metadata (title / description = topic / rules).
  update(
    channelId: string,
    token: string,
    patch: { title?: string; description?: string },
  ): Promise<Channel>
  // The protocol doc (markdown); no token needed.
  help(): Promise<string>
  destroy(channelId: string, token: string): Promise<void>
  join(channelId: string, token: string, name: string, kind?: MemberKind): Promise<ChannelMember[]>
  leave(channelId: string, token: string, name: string): Promise<void>
  members(channelId: string, token: string): Promise<ChannelMember[]>
  send(channelId: string, token: string, msg: SendInput): Promise<ChannelMessage>
  // Upload a file to the room; cite the returned `url` in a message so peers fetch it.
  uploadAttachment(
    channelId: string,
    token: string,
    input: { filename: string; contentType: string; body: Blob },
  ): Promise<Attachment>
  // Download a stored attachment (streamed); returns the raw Response so the
  // caller writes the body to disk without buffering.
  downloadAttachment(channelId: string, token: string, attId: string): Promise<Response>
  read(
    channelId: string,
    token: string,
    opts?: { since?: number; for?: string },
  ): Promise<ChannelMessage[]>
  // EventSource auto-reconnects; a monotonic cursor dedupes replay on reconnect.
  listen(channelId: string, token: string, opts: ListenOpts): () => void
}

export const channelClient = (baseUrl: string): ChannelClient => {
  const u = (p: string): string => `${baseUrl}${p}`
  const authed = (token: string) => ({ authorization: `Bearer ${token}` })
  const sendJson = (token: string) => ({ 'content-type': 'application/json', ...authed(token) })
  const member = (channelId: string, name: string): string =>
    u(`/channels/${channelId}/members/${encodeURIComponent(name)}`)
  return {
    create: async (workspaceId, title, description, token) => {
      const res = await fetch(u(`/workspaces/${workspaceId}/channels`), {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(token ? authed(token) : {}) },
        body: JSON.stringify({
          ...(title ? { title } : {}),
          ...(description ? { description } : {}),
        }),
      })
      if (!res.ok)
        throw new Error(
          `POST /workspaces/${workspaceId}/channels → ${res.status}: ${await res.text()}`,
        )
      return (await res.json()) as ChannelHandle
    },
    manifest: async (channelId, token) => {
      const res = await fetch(u(`/channels/${channelId}`), { headers: authed(token) })
      if (!res.ok) throw new Error(`GET channel → ${res.status}: ${await res.text()}`)
      return (await res.json()) as ChannelManifest
    },
    update: async (channelId, token, patch) => {
      const res = await fetch(u(`/channels/${channelId}`), {
        method: 'PATCH',
        headers: sendJson(token),
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error(`PATCH channel → ${res.status}: ${await res.text()}`)
      return (await res.json()) as Channel
    },
    help: async () => {
      const res = await fetch(u('/channels/help'))
      if (!res.ok) throw new Error(`GET /channels/help → ${res.status}: ${await res.text()}`)
      return await res.text()
    },
    destroy: async (channelId, token) => {
      const res = await fetch(u(`/channels/${channelId}`), {
        method: 'DELETE',
        headers: authed(token),
      })
      if (!res.ok) throw new Error(`DELETE channel → ${res.status}: ${await res.text()}`)
    },
    join: async (channelId, token, name, kind) => {
      const res = await fetch(member(channelId, name), {
        method: 'PUT',
        headers: sendJson(token),
        body: JSON.stringify({ kind: kind ?? 'agent' }),
      })
      if (!res.ok) throw new Error(`join channel → ${res.status}: ${await res.text()}`)
      return ((await res.json()) as { members: ChannelMember[] }).members
    },
    leave: async (channelId, token, name) => {
      const res = await fetch(member(channelId, name), { method: 'DELETE', headers: authed(token) })
      if (!res.ok) throw new Error(`leave channel → ${res.status}: ${await res.text()}`)
    },
    members: async (channelId, token) => {
      const res = await fetch(u(`/channels/${channelId}/members`), { headers: authed(token) })
      if (!res.ok) throw new Error(`GET members → ${res.status}: ${await res.text()}`)
      return ((await res.json()) as { members: ChannelMember[] }).members
    },
    send: async (channelId, token, msg) => {
      const res = await fetch(u(`/channels/${channelId}/messages`), {
        method: 'POST',
        headers: sendJson(token),
        body: JSON.stringify(msg),
      })
      if (!res.ok) throw new Error(`POST channel message → ${res.status}: ${await res.text()}`)
      return (await res.json()) as ChannelMessage
    },
    uploadAttachment: async (channelId, token, input) => {
      const res = await fetch(
        u(`/channels/${channelId}/attachments?filename=${encodeURIComponent(input.filename)}`),
        {
          method: 'POST',
          headers: { 'content-type': input.contentType, ...authed(token) },
          body: input.body,
        },
      )
      if (!res.ok) throw new Error(`upload attachment → ${res.status}: ${await res.text()}`)
      return (await res.json()) as Attachment
    },
    downloadAttachment: async (channelId, token, attId) => {
      const res = await fetch(u(`/channels/${channelId}/attachments/${attId}`), {
        headers: authed(token),
      })
      if (!res.ok) throw new Error(`download attachment → ${res.status}: ${await res.text()}`)
      return res
    },
    read: async (channelId, token, opts) => {
      const params = new URLSearchParams({ since: String(opts?.since ?? 0) })
      if (opts?.for) params.set('for', opts.for)
      const res = await fetch(u(`/channels/${channelId}/messages?${params}`), {
        headers: authed(token),
      })
      if (!res.ok) throw new Error(`GET messages → ${res.status}: ${await res.text()}`)
      return ((await res.json()) as { messages: ChannelMessage[] }).messages
    },
    listen: (channelId, token, opts) => {
      let cursor = opts.since ?? 0
      const params = new URLSearchParams({ since: String(cursor) })
      if (opts.for) params.set('for', opts.for)
      if (opts.as) params.set('as', opts.as)
      const es = new EventSource(u(`/channels/${channelId}/stream?${params}`), {
        fetch: (url, init) =>
          fetch(url, {
            ...init,
            headers: { ...(init?.headers as Record<string, string>), ...authed(token) },
          }),
      })
      es.onmessage = e => {
        try {
          const m = JSON.parse(e.data) as ChannelMessage
          if (m.seq <= cursor) return
          cursor = m.seq
          opts.onMessage(m)
        } catch (err) {
          opts.onError?.(err)
        }
      }
      es.onerror = err => opts.onError?.(err)
      return () => es.close()
    },
  }
}
