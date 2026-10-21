import type { Id, Loop } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../app/api-context'
import { TrashIcon } from '../../components/icons'
import {
  ContextClearInput,
  contextClearDraft,
  contextClearError,
  contextClearSeconds,
} from './context-clear-input'
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
  onSaveClear: (clearAfterSec: number | null) => Promise<boolean>
}

const LoopRow = ({ loop, busy, onToggle, onRemove, onSaveClear }: LoopRowProps) => {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const [clear, setClear] = useState(() => contextClearDraft(loop.clearAfterSec))
  const lastStatus = lastStatusText(loop.lastStatus)

  return (
    <div className="px-4 py-3 transition-colors hover:bg-ui-panel">
      <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ui-text">
        {loop.message}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ui-muted">
        <span>
          上下文清理：
          {loop.clearAfterSec === undefined ? '关闭' : `每 ${formatInterval(loop.clearAfterSec)}`}
        </span>
        {!editing && (
          <button
            type="button"
            disabled={busy}
            className="ui-quiet-button"
            onClick={() => {
              setClear(contextClearDraft(loop.clearAfterSec))
              setEditing(true)
            }}
          >
            设置清理
          </button>
        )}
      </div>
      {editing && (
        <form
          aria-label={`任务 ${loop.id} 的上下文清理`}
          className="mt-3 space-y-3"
          onSubmit={event => {
            event.preventDefault()
            if (busy || contextClearError(clear)) return
            void onSaveClear(contextClearSeconds(clear)).then(saved => saved && setEditing(false))
          }}
        >
          <ContextClearInput value={clear} onChange={setClear} disabled={busy} />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={busy || contextClearError(clear) !== null}
              className="ui-button"
            >
              {busy ? '保存中…' : '保存'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => setEditing(false)}
              className="ui-quiet-button"
            >
              取消
            </button>
          </div>
        </form>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-[11px] text-ui-muted">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${loop.enabled ? 'bg-ui-success' : 'bg-ui-border'}`}
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
            className="ui-quiet-button"
          >
            {loop.enabled ? 'Pause' : 'Resume'}
          </button>
          {confirming ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRemove().then(removed => removed && setConfirming(false))}
                className="ui-quiet-button ui-danger"
              >
                Confirm
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="ui-quiet-button"
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
              className="ui-icon-button ui-danger"
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
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-sm">
      <div className="shrink-0">
        {loading && <p className="px-4 py-6 text-center text-ui-muted">Loading tasks…</p>}
        {!loading && loops?.length === 0 && (
          <p className="px-4 py-6 text-center text-ui-muted">No scheduled tasks yet.</p>
        )}
        {loops && loops.length > 0 && (
          <div className="divide-y divide-ui-border">
            {loops.map(loop => (
              <LoopRow
                key={loop.id}
                loop={loop}
                busy={busy}
                onToggle={() =>
                  runAction(() => api.loops.update(loop.id, { enabled: !loop.enabled }))
                }
                onRemove={() => runAction(() => api.loops.remove(loop.id))}
                onSaveClear={clearAfterSec =>
                  runAction(() => api.loops.update(loop.id, { clearAfterSec }))
                }
              />
            ))}
          </div>
        )}
      </div>
      {(loadError || actionError) && (
        <p
          role="alert"
          className="border-t border-ui-danger-border bg-ui-danger-surface px-4 py-2 text-xs text-ui-danger"
        >
          {actionError ?? `Could not refresh scheduled tasks: ${loadError?.message}`}
        </p>
      )}
      <LoopCreateForm sessionId={sessionId} />
    </div>
  )
}
