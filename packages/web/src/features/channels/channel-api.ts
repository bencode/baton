import type { Attachment, ChannelManifest, ChannelMember, ChannelMessage } from '@baton/shared'

// Channel participation auth is existence-only: the channel uuid IS the capability,
// so this client sends no token/Bearer — every call is keyed on the channel id in
// the URL (decoupled from the cookie login).
const API_BASE = '/api'

export type SendInput = { from: string; text: string; to?: string[]; attachments?: Attachment[] }
export type JoinResult = { taken: boolean; members: ChannelMember[] }

export type ChannelApi = {
  manifest: (id: string) => Promise<ChannelManifest>
  members: (id: string) => Promise<ChannelMember[]>
  // Claim a display name (kind=human). 409 → `taken`, so the caller picks another.
  join: (id: string, name: string) => Promise<JoinResult>
  // Release a display name (leave the roster); used on rename to free the old one.
  leave: (id: string, name: string) => Promise<void>
  send: (id: string, msg: SendInput) => Promise<ChannelMessage>
  // Upload a file to the room (raw body); cite the returned Attachment on a message.
  uploadAttachment: (id: string, file: File) => Promise<Attachment>
  // Plain download URL — no token to carry (the id in the path is the capability).
  attachmentUrl: (att: Attachment) => string
  // EventSource live stream; `as` keeps the human on the roster, `since` resumes a gap.
  streamUrl: (id: string, q: { as: string; since: number }) => string
}

const req = (url: string, init: { method?: string; body?: unknown } = {}): Promise<Response> =>
  fetch(url, {
    method: init.method ?? 'GET',
    ...(init.body !== undefined
      ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }
      : {}),
  })

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

export const createChannelApi = (): ChannelApi => ({
  manifest: id => req(`${API_BASE}/channels/${id}`).then(r => json<ChannelManifest>(r)),
  members: id =>
    req(`${API_BASE}/channels/${id}/members`)
      .then(r => json<{ members: ChannelMember[] }>(r))
      .then(d => d.members),
  join: async (id, name) => {
    const res = await req(`${API_BASE}/channels/${id}/members/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: { kind: 'human' },
    })
    const d = (await res.json()) as { members: ChannelMember[] }
    return { taken: res.status === 409, members: d.members }
  },
  leave: async (id, name) => {
    await req(`${API_BASE}/channels/${id}/members/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    })
  },
  send: (id, msg) =>
    req(`${API_BASE}/channels/${id}/messages`, {
      method: 'POST',
      body: { ...msg, senderKind: 'human' },
    }).then(r => json<ChannelMessage>(r)),
  uploadAttachment: (id, file) =>
    fetch(
      `${API_BASE}/channels/${id}/attachments?filename=${encodeURIComponent(file.name || 'file')}`,
      {
        method: 'POST',
        headers: { 'content-type': file.type || 'application/octet-stream' },
        body: file,
      },
    ).then(r => json<Attachment>(r)),
  attachmentUrl: att => `${API_BASE}${att.url}`,
  streamUrl: (id, q) =>
    `${API_BASE}/channels/${id}/stream?as=${encodeURIComponent(q.as)}&kind=human&since=${q.since}`,
})
