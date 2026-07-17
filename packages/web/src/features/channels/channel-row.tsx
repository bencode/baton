import type { Channel } from '@baton/shared'
import { useState } from 'react'
import { TrashIcon } from '../../components/icons'

type ChannelRowProps = {
  channel: Channel
  open: () => void
  onDelete: () => void
}

// Whole row opens the room; a hover-revealed trash flips into an inline
// two-step confirm (✓ / ✗) so deletion never rides a single misclick. Open and
// delete are sibling buttons (no nested <button>).
export const ChannelRow = ({ channel, open, onDelete }: ChannelRowProps) => {
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="group relative flex items-center rounded-md text-sm text-gray-700 transition-colors duration-150 hover:bg-gray-100">
      <button
        type="button"
        onClick={open}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1 text-left"
      >
        <span className="text-gray-400">#</span>
        <span className="truncate">{channel.title || channel.id.slice(0, 8)}</span>
      </button>
      {confirming ? (
        <span className="flex shrink-0 items-center gap-3 px-1.5 text-xs">
          <button
            type="button"
            aria-label="confirm delete"
            title="delete"
            onClick={() => {
              setConfirming(false)
              onDelete()
            }}
            className="px-0.5 text-red-500 transition-colors hover:text-red-700"
          >
            ✓
          </button>
          <button
            type="button"
            aria-label="cancel delete"
            title="cancel"
            onClick={() => setConfirming(false)}
            className="px-0.5 text-gray-400 transition-colors hover:text-gray-700"
          >
            ✗
          </button>
        </span>
      ) : (
        <button
          type="button"
          aria-label="delete channel"
          title="delete channel"
          onClick={() => setConfirming(true)}
          className="shrink-0 px-1.5 text-gray-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  )
}
