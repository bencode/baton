import type { Attachment } from '@baton/shared'

// Dev: '/api' is proxied to the server (prefix stripped). Prod base decided when
// the server hosts the UI.
export const API_BASE = '/api'

// Browser-resolvable src for an attachment's bytes (img preview / download link).
export const attachmentSrc = (a: Attachment): string => `${API_BASE}${a.url}`

export type ReqInit = { method: string; body?: unknown }

// The browser fetch wrapper shared by every per-resource client. Same-origin so
// the session cookie rides along — this authenticates every back-office call
// once auth is on. 204 → undefined; non-2xx → throw with status.
export const request = async <T>(url: string, init: ReqInit): Promise<T> => {
  const res = await fetch(url, {
    method: init.method,
    credentials: 'same-origin',
    ...(init.body !== undefined
      ? { body: JSON.stringify(init.body), headers: { 'content-type': 'application/json' } }
      : {}),
  })
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

// A url builder bound to the API base; each resource client takes one.
export type Url = (path: string) => string
export const urlFor =
  (base: string): Url =>
  path =>
    `${base}${path}`
