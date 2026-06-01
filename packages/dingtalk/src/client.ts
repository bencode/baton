import type { Attachment, Id, SessionEvent, SessionView } from '@baton/shared'

// A thin client over baton's session endpoints. The bridge is a pure API
// consumer — it adds nothing to the server. Once the server enforces auth (a
// user is seeded), the bridge authenticates with BATON_USER/PASS: createBaton-
// Client logs in once, and every request (plus the SSE stream fetch) carries the
// session cookie. With no creds it behaves exactly as before (dev / auth-off).
type ReqInit = { method: string; body?: unknown }

let authCookie = ''
let loginGate: Promise<void> | null = null

const cookieHeader = (): Record<string, string> => (authCookie ? { cookie: authCookie } : {})

const request = async <T>(url: string, init: ReqInit): Promise<T> => {
  if (loginGate) await loginGate
  const res = await fetch(url, {
    method: init.method,
    headers: {
      ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...cookieHeader(),
    },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// Authenticated fetch for the SSE transcript stream (passed to waitForTurn). It
// waits on the login and attaches the cookie, so the gated /stream endpoint lets
// it through.
export const authedFetch = async (
  url: string,
  init?: { signal?: AbortSignal },
): Promise<Response> => {
  if (loginGate) await loginGate
  return fetch(url, { signal: init?.signal, headers: cookieHeader() })
}

export type BatonClient = {
  createSession(projectId: Id, workerId: Id): Promise<SessionView>
  getSession(id: Id): Promise<SessionView>
  resumeSession(id: Id): Promise<SessionView>
  // Returns the synthesized user_message event — its `sequence` lets us wait for
  // the matching turn_complete (one after this message).
  sendMessage(id: Id, text: string, attachments?: Attachment[]): Promise<SessionEvent>
  // Upload raw bytes (a downloaded DingTalk image) as a session attachment.
  uploadAttachment(
    id: Id,
    input: { filename: string; contentType: string; body: Uint8Array },
  ): Promise<Attachment>
  streamUrl(id: Id): string
}

export type BatonCreds = { username: string; password: string }

export const createBatonClient = (server: string, creds?: BatonCreds): BatonClient => {
  const u = (p: string): string => `${server}${p}`
  if (creds) {
    loginGate = (async () => {
      const res = await fetch(u('/auth/login'), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(creds),
      })
      const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
      if (res.ok && cookie) authCookie = cookie
    })().catch(() => {})
  }
  return {
    createSession: (projectId, workerId) =>
      request(u('/sessions'), { method: 'POST', body: { projectId, workerId } }),
    getSession: id => request(u(`/sessions/${id}`), { method: 'GET' }),
    resumeSession: id => request(u(`/sessions/${id}/resume`), { method: 'POST' }),
    sendMessage: (id, text, attachments) =>
      request(u(`/sessions/${id}/messages`), {
        method: 'POST',
        body: attachments && attachments.length > 0 ? { text, attachments } : { text },
      }),
    uploadAttachment: async (id, input) => {
      if (loginGate) await loginGate
      const url = u(`/sessions/${id}/attachments?filename=${encodeURIComponent(input.filename)}`)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': input.contentType, ...cookieHeader() },
        body: input.body,
      })
      if (!res.ok) throw new Error(`POST ${url} → ${res.status}: ${await res.text()}`)
      return (await res.json()) as Attachment
    },
    streamUrl: id => u(`/sessions/${id}/stream`),
  }
}
