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
    <div className="group relative flex items-center rounded-md text-[13px] text-ui-text transition-colors duration-150 hover:bg-ui-hover">
      <button
        type="button"
        onClick={open}
        className="ui-focus flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left md:min-h-8 [@media(pointer:coarse)]:min-h-11"
      >
        <span className="w-4 shrink-0 text-center text-ui-muted">#</span>
        <span className="truncate">{channel.title || channel.id.slice(0, 8)}</span>
      </button>
      {confirming ? (
        <span className="flex shrink-0 items-center gap-1 text-xs">
          <button
            type="button"
            aria-label="confirm delete"
            title="delete"
            onClick={() => {
              setConfirming(false)
              onDelete()
            }}
            className="ui-icon-button ui-danger"
          >
            ✓
          </button>
          <button
            type="button"
            aria-label="cancel delete"
            title="cancel"
            onClick={() => setConfirming(false)}
            className="ui-icon-button"
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
          className="ui-icon-button ui-danger [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  )
}
