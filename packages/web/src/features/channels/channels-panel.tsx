import type { Id } from '@baton/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { bumpLists } from '../../hooks/use-list-revision'
import { useChannels } from './use-channels'

// The room's standalone page is keyed on the channel id alone (the uuid is the
// capability — no token in the link).
const roomPath = (id: string): string => `/channel/${id}`

// Left-panel section: the current workspace's rooms + a one-field "new channel"
// create. Clicking a room (or creating one) navigates to the full-page chat — the
// member is logged in, so the room auto-claims their username as the nickname.
export const ChannelsPanel = ({ workspaceId }: { workspaceId: Id }) => {
  const api = useApi()
  const navigate = useNavigate()
  const { data: channels, loading } = useChannels(workspaceId)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const create = async () => {
    if (creating) return
    const name = title.trim()
    setCreating(true)
    try {
      const { channelId } = await api.channels.create(
        workspaceId,
        name ? { title: name } : undefined,
      )
      setTitle('')
      bumpLists() // so the list is fresh when the member returns from the room
      navigate(roomPath(channelId))
    } catch (err) {
      console.error('[channels] create failed', err)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {loading && <p className="px-2 text-sm text-gray-400">loading…</p>}
      {!loading && channels?.length === 0 && (
        <p className="px-2 text-sm text-gray-400">No channels yet.</p>
      )}
      {channels?.map(ch => (
        <button
          key={ch.id}
          type="button"
          onClick={() => navigate(roomPath(ch.id))}
          className="flex items-center gap-2 rounded-md px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-100"
        >
          <span className="text-gray-400">#</span>
          <span className="truncate">{ch.title || ch.id.slice(0, 8)}</span>
        </button>
      ))}
      <form
        onSubmit={e => {
          e.preventDefault()
          void create()
        }}
        className="mt-1 flex items-center gap-1 px-1"
      >
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="New channel…"
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-400"
        />
        <button
          type="submit"
          disabled={creating}
          aria-label="create channel"
          className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100 disabled:opacity-40"
        >
          +
        </button>
      </form>
    </div>
  )
}
