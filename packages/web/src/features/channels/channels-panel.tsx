import type { Id } from '@baton/shared'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { bumpLists } from '../../hooks/use-list-revision'
import { ChannelRow } from './channel-row'
import { useChannels } from './use-channels'

// The room's standalone page is keyed on the channel id alone (the uuid is the
// capability — no token in the link).
const roomPath = (id: string): string => `/channel/${id}`

// Left-panel section: the current workspace's rooms. Creation hides behind the
// header "+" (Enter creates, Esc closes) so the list stays quiet at rest.
// Clicking a room (or creating one) navigates to the full-page chat — the
// member is logged in, so the room auto-claims their username as the nickname.
export const ChannelsPanel = ({ workspaceId }: { workspaceId: Id }) => {
  const api = useApi()
  const navigate = useNavigate()
  const { data: channels, loading } = useChannels(workspaceId)
  const [adding, setAdding] = useState(false)
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
      setAdding(false)
      bumpLists() // so the list is fresh when the member returns from the room
      navigate(roomPath(channelId))
    } catch (err) {
      console.error('[channels] create failed', err)
    } finally {
      setCreating(false)
    }
  }

  const remove = async (channelId: string) => {
    try {
      await api.channels.remove(channelId)
    } catch (err) {
      console.error('[channels] delete failed', err)
    } finally {
      // No server-pushed invalidation for channels; refetch manually. Also on
      // failure — a 404 means someone else already deleted it, so re-sync.
      bumpLists()
    }
  }

  return (
    <section className="flex flex-col gap-1">
      <div className="mb-1 flex items-center justify-between px-1">
        <h2 className="text-xs font-semibold tracking-wider text-gray-500 uppercase">Channels</h2>
        <button
          type="button"
          aria-label="new channel"
          title="new channel"
          onClick={() => setAdding(v => !v)}
          className="px-1 text-sm leading-none text-gray-400 hover:text-blue-700"
        >
          +
        </button>
      </div>
      {loading && <p className="px-2 text-sm text-gray-400">loading…</p>}
      {!loading && channels?.length === 0 && (
        <p className="px-2 text-sm text-gray-400">No channels yet.</p>
      )}
      {channels?.map(ch => (
        <ChannelRow
          key={ch.id}
          channel={ch}
          open={() => navigate(roomPath(ch.id))}
          onDelete={() => void remove(ch.id)}
        />
      ))}
      {adding && (
        <form
          onSubmit={e => {
            e.preventDefault()
            void create()
          }}
          className="mt-1 px-1"
        >
          <input
            // biome-ignore lint/a11y/noAutofocus: form opens on explicit user click
            autoFocus
            value={title}
            disabled={creating}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape') setAdding(false)
            }}
            placeholder="New channel…"
            className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-sm outline-none focus:border-blue-400 disabled:opacity-40"
          />
        </form>
      )}
    </section>
  )
}
