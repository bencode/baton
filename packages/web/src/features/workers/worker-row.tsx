import type { WorkerView } from '@baton/shared'
import { useState } from 'react'
import { TrashIcon } from '../../components/icons'

type WorkerRowProps = {
  worker: WorkerView
  sessionCount: number | null
  onDelete(): Promise<void>
}

export const WorkerRow = ({ worker, sessionCount, onDelete }: WorkerRowProps) => {
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
    <div className="border-b border-ui-border py-4 last:border-0">
      <div className="flex items-start gap-3">
        <span
          role="img"
          aria-label={worker.connected ? 'online' : 'offline'}
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${worker.connected ? 'bg-ui-success' : 'border border-ui-muted'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" title={worker.name}>
            {worker.name}
          </p>
          <p className="mt-1 break-all text-xs text-ui-muted">
            {worker.agentKind === 'codex' ? 'Codex' : 'Claude Code'} · {worker.hostname}
          </p>
          <p className="mt-1 text-xs text-ui-muted">
            W-{worker.id} · {worker.connected ? 'Online' : 'Offline'}
            {sessionCount !== null && ` · ${sessionCount} conversations`}
          </p>
        </div>
        <button
          type="button"
          aria-label="delete worker"
          disabled={sessionCount === null || deleting}
          onClick={() => setConfirming(true)}
          className="ui-icon-button"
        >
          <TrashIcon />
        </button>
      </div>
      {confirming && (
        <div className="mt-3 rounded-md bg-ui-panel p-3 text-sm">
          <p>
            Delete this worker and its {sessionCount} conversations? This permanently removes their
            history.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirming(false)}
              aria-label="cancel delete worker"
              className="ui-button"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
              aria-label="confirm delete worker"
              className="ui-button ui-danger"
            >
              {deleting ? 'Deleting…' : 'Delete worker'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-ui-danger">
          {error}
        </p>
      )}
    </div>
  )
}
