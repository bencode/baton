import type { WorkerView } from '@baton/shared'
import { useState } from 'react'
import { TrashIcon } from '../../components/icons'
import { agentKindLabel } from '../../utils/agent-kind'

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
    <div className="mg-resource-row">
      <div className="mg-resource-main">
        <span
          role="img"
          aria-label={worker.connected ? '在线' : '离线'}
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${worker.connected ? 'bg-ui-success' : 'border border-ui-muted'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="mg-resource-title truncate" title={worker.name}>
            {worker.name}
          </p>
          <p className="mg-resource-meta">
            {agentKindLabel[worker.agentKind]} · {worker.hostname}
          </p>
          <p className="mg-resource-meta">
            W-{worker.id} · {worker.connected ? '在线' : '离线'}
            {sessionCount !== null && ` · ${sessionCount} 段会话`}
          </p>
        </div>
        <button
          type="button"
          aria-label="删除执行环境"
          disabled={sessionCount === null || deleting}
          onClick={() => setConfirming(true)}
          className="ui-icon-button"
        >
          <TrashIcon />
        </button>
      </div>
      {confirming && (
        <div className="mg-confirm">
          <p>
            删除“{worker.name}”及其 {sessionCount} 段会话？会话历史将同时删除。
          </p>
          <div className="mg-form-actions">
            <button
              type="button"
              disabled={deleting}
              onClick={() => setConfirming(false)}
              aria-label="取消删除执行环境"
              className="ui-button"
            >
              取消
            </button>
            <button
              type="button"
              disabled={deleting}
              onClick={() => void remove()}
              aria-label="确认删除执行环境"
              className="ui-button ui-danger"
            >
              {deleting ? '删除中…' : '确认删除'}
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
