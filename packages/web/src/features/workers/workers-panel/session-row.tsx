import type { SessionView } from '@baton/shared'
import { useState } from 'react'
import { ClockIcon } from '../../../components/icons'
import { relativeTime } from '../../sessions/relative-time'
import { TrashIcon } from './icons'

type SessionRowProps = {
  session: SessionView
  path: string
  active: boolean
  dim: boolean
  open: (id: string, title: string) => void
  onDelete: () => void
}

// Whole row opens the session; a hover-revealed trash flips into an inline
// two-step confirm (✓ / ✗) so deletion never rides a single misclick. Open and
// delete are sibling buttons (no nested <button>).
export const SessionRow = ({ session, path, active, dim, open, onDelete }: SessionRowProps) => {
  const [confirming, setConfirming] = useState(false)
  return (
    <div
      className={`group relative flex items-center rounded-md text-sm transition-colors duration-150 ${
        active ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-100/70'
      } ${dim ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        onClick={() => open(path, session.name)}
        className="flex min-w-0 flex-1 items-center gap-2 py-1 pl-3 text-left"
      >
        <SessionDot session={session} />
        <span className="truncate">{session.name}</span>
        {session.activeLoops > 0 && (
          <span
            role="img"
            aria-label={`${session.activeLoops} active loop(s)`}
            title={`${session.activeLoops} active loop(s)`}
            className="inline-flex shrink-0 text-blue-400"
          >
            <ClockIcon />
          </span>
        )}
        <span className="ml-auto shrink-0 pr-1 text-[10px] text-gray-400 tabular-nums">
          {relativeTime(session.lastActiveAt)}
        </span>
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
          aria-label="delete session"
          title="delete session"
          onClick={() => setConfirming(true)}
          className="shrink-0 px-1.5 text-gray-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  )
}

// Session liveness at a glance: busy = amber pulse, active (worker child up) =
// solid emerald, inactive = hollow outline (shape difference reads at 6px).
const SessionDot = ({ session }: { session: SessionView }) => {
  if (session.busy)
    return (
      <span
        role="img"
        aria-label="busy"
        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
      />
    )
  if (session.attached)
    return (
      <span
        role="img"
        aria-label="active"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
      />
    )
  return (
    <span
      role="img"
      aria-label="inactive"
      className="h-1.5 w-1.5 shrink-0 rounded-full border border-gray-400 bg-transparent"
    />
  )
}
