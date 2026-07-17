import type { Channel, Id } from '@baton/shared'
import { request, type Url } from './request'

// Workspace-scoped chat rooms (membership-gated). A member opens any room by its
// id (the channel uuid is the participation capability — no token).
export type ChannelsApi = {
  listByWorkspace(workspaceId: Id): Promise<Channel[]>
  create(
    workspaceId: Id,
    input?: { title?: string; description?: string },
  ): Promise<{ channelId: string; help: string }>
  // Delete a room (cascades to its messages + attachments, drops the roster).
  remove(channelId: string): Promise<void>
}

export const channelsApi = (u: Url): ChannelsApi => ({
  listByWorkspace: workspaceId =>
    request(u(`/workspaces/${workspaceId}/channels`), { method: 'GET' }),
  create: (workspaceId, input) =>
    request(u(`/workspaces/${workspaceId}/channels`), { method: 'POST', body: input ?? {} }),
  remove: channelId => request(u(`/channels/${channelId}`), { method: 'DELETE' }),
})
