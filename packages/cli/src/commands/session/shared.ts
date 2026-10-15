import type { Id } from '@baton/shared'
import type { ApiClient } from '../../client.ts'

// Resolve a session positional arg: tries int id first, then name lookup.
export const resolveSession = async (
  client: ApiClient,
  projectId: Id,
  handle: string,
): Promise<{ id: Id; name: string }> => {
  const asInt = Number(handle)
  if (Number.isInteger(asInt) && asInt > 0) {
    const byId = await client.sessions.get(asInt).catch(() => null)
    if (byId) return { id: byId.id, name: byId.name }
  }
  const byName = await client.sessions.findByName(projectId, handle)
  if (byName) return { id: byName.id, name: byName.name }
  throw new Error(`session "${handle}" not found in project ${projectId}`)
}
