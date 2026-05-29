export type ReqInit = { method: string; body?: unknown; headers?: Record<string, string> }

// Shared HTTP helper for every per-resource sub-client. Throws on non-2xx and
// transparently handles 204 (DELETE / close).
export const request = async <T>(url: string, init: ReqInit): Promise<T> => {
  const baseHeaders: Record<string, string> =
    init.body !== undefined ? { 'content-type': 'application/json' } : {}
  const res = await fetch(url, {
    method: init.method,
    headers: { ...baseHeaders, ...(init.headers ?? {}) },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  })
  if (!res.ok) throw new Error(`${init.method} ${url} → ${res.status}: ${await res.text()}`)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
