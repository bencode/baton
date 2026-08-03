import type { Id, Loop } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../app/api-context'
import { TrashIcon } from '../../components/icons'
import { formatInterval } from './format'
import { LoopCreateForm } from './loop-create-form'
import { useLoops } from './use-loops'

const lastStatusText = (status: Loop['lastStatus']): string | null => {
  if (status === 'ok') return 'Last run succeeded'
  if (status === 'skipped_offline') return 'Last run skipped: worker offline'
  return null
}

type LoopRowProps = {
  loop: Loop
  busy: boolean
  onToggle: () => Promise<boolean>
  onRemove: () => Promise<boolean>
}

const LoopRow = ({ loop, busy, onToggle, onRemove }: LoopRowProps) => {
  const [confirming, setConfirming] = useState(false)
  const lastStatus = lastStatusText(loop.lastStatus)

  return (
    <div className="px-4 py-3 transition-colors hover:bg-gray-50">
      <p className="whitespace-pre-wrap break-words text-sm leading-5 text-gray-800">
        {loop.message}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${loop.enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}
        />
        <span>{loop.enabled ? 'Enabled' : 'Paused'}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono">Every {formatInterval(loop.intervalSec)}</span>
        {lastStatus && (
          <>
            <span aria-hidden="true">·</span>
            <span>{lastStatus}</span>
          </>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onToggle()}
            className="rounded px-1.5 py-1 font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 disabled:opacity-40"
          >
            {loop.enabled ? 'Pause' : 'Resume'}
          </button>
          {confirming ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRemove().then(removed => removed && setConfirming(false))}
                className="rounded px-1.5 py-1 font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:opacity-40"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="rounded px-1.5 py-1 font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400/30 disabled:opacity-40"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label="delete scheduled task"
              title="delete scheduled task"
              disabled={busy}
              onClick={() => setConfirming(true)}
              className="rounded p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:opacity-40"
            >
              <TrashIcon />
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

export const LoopsPanel = ({ sessionId, projectId }: { sessionId: Id; projectId: Id }) => {
  const api = useApi()
  const { data: loops, loading, error: loadError } = useLoops(sessionId, projectId)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const runAction = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    setActionError(null)
    try {
      await action()
      return true
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Scheduled task action failed')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col text-sm">
      <div className="min-h-0 flex-1 overflow-y-auto">
        {loading && <p className="px-4 py-6 text-center text-gray-500">Loading tasks…</p>}
        {!loading && loops?.length === 0 && (
          <p className="px-4 py-6 text-center text-gray-500">No scheduled tasks yet.</p>
        )}
        {loops && loops.length > 0 && (
          <div className="divide-y divide-gray-100">
            {loops.map(loop => (
              <LoopRow
                key={loop.id}
                loop={loop}
                busy={busy}
                onToggle={() =>
                  runAction(() => api.loops.update(loop.id, { enabled: !loop.enabled }))
                }
                onRemove={() => runAction(() => api.loops.remove(loop.id))}
              />
            ))}
          </div>
        )}
      </div>
      {(loadError || actionError) && (
        <p
          role="alert"
          className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700"
        >
          {actionError ?? `Could not refresh scheduled tasks: ${loadError?.message}`}
        </p>
      )}
      <LoopCreateForm sessionId={sessionId} />
    </div>
  )
}
