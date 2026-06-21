import type { ChannelListItem, Id } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'
import { useListRevision } from '../../hooks/use-list-revision'

// The current workspace's chat rooms (membership-gated; each carries its token so
// a member can open the room). Mirrors useProjects — re-keyed by useListRevision
// so a create/rename refetches.
export const useChannels = (workspaceId: Id | null) => {
  const api = useApi()
  const rev = useListRevision()
  return useAsync<ChannelListItem[]>(
    () => (workspaceId !== null ? api.channels.listByWorkspace(workspaceId) : Promise.resolve([])),
    `${workspaceId}:${rev}`,
  )
}
