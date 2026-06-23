import type { Code, Id } from '@baton/shared'
import { request, type Url } from './request'

// Resolve an item by its project-scoped code via the shared items endpoint, and
// assert it's the kind the caller expects. Shared by requirements + tasks getByCode.
export const fetchItemByCode = async (
  u: Url,
  projectId: Id,
  code: Code,
  expectKind: 'requirement' | 'task',
): Promise<unknown> => {
  const r = await request<{ kind: string; item: unknown }>(
    u(`/projects/${projectId}/items/${encodeURIComponent(code)}`),
    { method: 'GET' },
  )
  if (r.kind !== expectKind) throw new Error(`expected ${expectKind} but got ${r.kind} for ${code}`)
  return r.item
}
