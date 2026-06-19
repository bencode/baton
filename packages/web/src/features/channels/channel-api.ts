import type { ChannelManifest, ChannelMember, ChannelMessage } from '@baton/shared'

// Channel uses a per-room capability token (id + token), decoupled from the
// cookie login — so this client injects `Authorization: Bearer <token>` instead
// of riding the session cookie like the back-office `api.ts`. The token comes
// from the share link's hash fragment.
const API_BASE = '/api'

export type SendInput = { from: string; text: string; to?: string[] }
export type JoinResult = { taken: boolean; members: ChannelMember[] }

export type ChannelApi = {
  manifest: (id: string) => Promise<ChannelManifest>
  members: (id: string) => Promise<ChannelMember[]>
  // Claim a display name (kind=human). 409 → `taken`, so the caller picks another.
  join: (id: string, name: string) => Promise<JoinResult>
  send: (id: string, msg: SendInput) => Promise<ChannelMessage>
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
  manifest: id => authFetch(`${API_BASE}/channels/${id}`, token).then(r => json<ChannelManifest>(r)),
  members: id =>
    authFetch(`${API_BASE}/channels/${id}/members`, token)
      .then(r => json<{ members: ChannelMember[] }>(r))
      .then(d => d.members),
  join: async (id, name) => {
    const res = await authFetch(`${API_BASE}/channels/${id}/members/${encodeURIComponent(name)}`, token, {
      method: 'PUT',
      body: { kind: 'human' },
    })
    const d = (await res.json()) as { members: ChannelMember[] }
    return { taken: res.status === 409, members: d.members }
  },
  send: (id, msg) =>
    authFetch(`${API_BASE}/channels/${id}/messages`, token, {
      method: 'POST',
      body: { ...msg, senderKind: 'human' },
    }).then(r => json<ChannelMessage>(r)),
  streamUrl: (id, q) =>
    `${API_BASE}/channels/${id}/stream?token=${encodeURIComponent(token)}` +
    `&as=${encodeURIComponent(q.as)}&kind=human&since=${q.since}`,
})
