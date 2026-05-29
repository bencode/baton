import type { Code, Id } from '@baton/shared'
import { request } from './request.ts'

// Resolve a project-scoped code (R-N / T-N) to its item. The caller asserts
// the expected kind so a renamed code can't be silently coerced.
export const fetchItemByCode = async <T>(
  baseUrl: string,
  projectId: Id,
  code: Code,
  expectKind: string,
): Promise<T> => {
  const r = await request<{ kind: string; item: unknown }>(
    `${baseUrl}/projects/${projectId}/items/${encodeURIComponent(code)}`,
    { method: 'GET' },
  )
  if (r.kind !== expectKind) throw new Error(`expected ${expectKind} but got ${r.kind} for ${code}`)
  return r.item as T
}
