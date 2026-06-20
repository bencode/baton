import type { Attachment, ChannelManifest, ChannelMember, ChannelMessage } from '@baton/shared'

// Channel uses a per-room capability token (id + token), decoupled from the
// cookie login — so this client injects `Authorization: Bearer <token>` instead
// of riding the session cookie like the back-office `api.ts`. The token comes
// from the share link's hash fragment.
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
  // Upload a file to the room (Bearer, raw body); cite the returned Attachment on a message.
  uploadAttachment: (id: string, file: File) => Promise<Attachment>
  // Token-bearing download URL — browsers can't set the Bearer header on <img>/<a>,
  // so the capability token rides the query (the GET route accepts ?token=).
  attachmentUrl: (att: Attachment) => string
  // EventSource can't set headers, so the live stream carries the token (+ as/since)
  // in the query. `as` keeps the human on the roster; `since` resumes after a gap.
  streamUrl: (id: string, q: { as: string; since: number }) => string
}

const authFetch = (
  url: string,
  token: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> =>
  fetch(url, {
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

export const createChannelApi = (token: string): ChannelApi => ({
  manifest: id =>
    authFetch(`${API_BASE}/channels/${id}`, token).then(r => json<ChannelManifest>(r)),
  members: id =>
    authFetch(`${API_BASE}/channels/${id}/members`, token)
      .then(r => json<{ members: ChannelMember[] }>(r))
      .then(d => d.members),
  join: async (id, name) => {
    const res = await authFetch(
      `${API_BASE}/channels/${id}/members/${encodeURIComponent(name)}`,
      token,
      {
        method: 'PUT',
        body: { kind: 'human' },
      },
    )
    const d = (await res.json()) as { members: ChannelMember[] }
    return { taken: res.status === 409, members: d.members }
  },
  leave: async (id, name) => {
    await authFetch(`${API_BASE}/channels/${id}/members/${encodeURIComponent(name)}`, token, {
      method: 'DELETE',
    })
  },
  send: (id, msg) =>
    authFetch(`${API_BASE}/channels/${id}/messages`, token, {
      method: 'POST',
      body: { ...msg, senderKind: 'human' },
    }).then(r => json<ChannelMessage>(r)),
  uploadAttachment: (id, file) =>
    fetch(
      `${API_BASE}/channels/${id}/attachments?filename=${encodeURIComponent(file.name || 'file')}`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': file.type || 'application/octet-stream',
        },
        body: file,
      },
    ).then(r => json<Attachment>(r)),
  attachmentUrl: att => `${API_BASE}${att.url}?token=${encodeURIComponent(token)}`,
  streamUrl: (id, q) =>
    `${API_BASE}/channels/${id}/stream?token=${encodeURIComponent(token)}` +
    `&as=${encodeURIComponent(q.as)}&kind=human&since=${q.since}`,
})
