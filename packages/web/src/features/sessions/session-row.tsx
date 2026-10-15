import type { SessionView } from '@baton/shared'
import { useState } from 'react'
import { ClockIcon, TrashIcon } from '../../components/icons'
import { relativeTime } from './relative-time'

type SessionRowProps = {
  session: SessionView
  active: boolean
  onOpen(): void
  onDelete(): Promise<void>
}

const SessionDot = ({ session }: { session: SessionView }) => {
  const status = !session.connected
    ? 'Offline'
    : session.busy
      ? 'Running'
      : session.attached
        ? 'Ready'
        : 'Idle'
  const appearance =
    !session.connected || (!session.attached && !session.busy)
      ? 'border border-ui-muted'
      : session.busy
        ? 'animate-breathe bg-ui-accent'
        : 'bg-ui-success'
  return (
    <span
      role="img"
      aria-label={status}
      title={status}
      className={`block h-1.5 w-1.5 shrink-0 rounded-full ${appearance}`}
    />
  )
}

export const SessionRow = ({ session, active, onOpen, onDelete }: SessionRowProps) => {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onDelete()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
      setDeleting(false)
    }
  }
  return (
    <div className={`group rounded-md ${active ? 'bg-ui-selected' : 'hover:bg-ui-hover'}`}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpen}
          aria-current={active ? 'page' : undefined}
          className="ui-focus flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 text-left"
        >
          <span className="mt-1.5">
            <SessionDot session={session} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1">
              <span
                className={`truncate text-[13px] font-medium ${active ? 'text-ui-selected-text' : 'text-ui-text'}`}
                title={session.name}
              >
                {session.name}
              </span>
              {session.activeLoops > 0 && (
                <span role="img" aria-label={`${session.activeLoops} active loop(s)`}>
                  <ClockIcon />
                </span>
              )}
            </span>
            <span
              className={`mt-0.5 flex items-center gap-2 text-xs md:text-[11px] ${active ? 'text-ui-selected-muted' : 'text-ui-muted'}`}
            >
              <span
                className="truncate"
                title={`${session.worker.name} · ${session.worker.hostname}`}
              >
                {session.agentKind === 'codex' ? 'Codex' : 'Claude Code'} · {session.worker.name}
              </span>
              <span className="ml-auto shrink-0 tabular-nums">
                {relativeTime(session.lastActiveAt)}
              </span>
            </span>
          </span>
        </button>
        {!confirming && (
          <button
            type="button"
            aria-label="delete session"
            onClick={() => setConfirming(true)}
            className="ui-icon-button mr-1 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          >
            <TrashIcon />
          </button>
        )}
      </div>
      {confirming && (
        <div className="flex flex-wrap items-center justify-end gap-2 px-2 pb-2 text-xs text-ui-muted">
          <span>Delete conversation?</span>
          <button
            type="button"
            aria-label="cancel delete"
            disabled={deleting}
            onClick={() => setConfirming(false)}
            className="ui-button"
          >
            Cancel
          </button>
          <button
            type="button"
            aria-label="confirm delete"
            disabled={deleting}
            onClick={() => void remove()}
            className="ui-button ui-danger"
          >
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="px-2 pb-2 text-xs text-ui-danger">
          {error}
        </p>
      )}
    </div>
  )
}
