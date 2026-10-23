import type { Id, Loop } from '@baton/shared'
import { useState } from 'react'
import type { LoopPatch } from '../../api/loops'
import { useApi } from '../../app/api-context'
import { TrashIcon } from '../../components/icons'
import { formatInterval } from './format'
import { LoopForm } from './loop-form'
import { useLoops } from './use-loops'

const lastStatusText = (status: Loop['lastStatus']): string | null => {
  if (status === 'ok') return '上次执行成功'
  if (status === 'skipped_offline') return '上次跳过：worker 离线'
  return null
}

const contextText = (clearEveryRuns?: number): string => {
  if (clearEveryRuns === undefined) return '保留'
  if (clearEveryRuns === 1) return '每次清空'
  return `每 ${clearEveryRuns} 次清空`
}

type LoopRowProps = {
  loop: Loop
  busy: boolean
  onToggle: () => Promise<boolean>
  onRemove: () => Promise<boolean>
  onSave: (patch: LoopPatch) => Promise<void>
}

const LoopRow = ({ loop, busy, onToggle, onRemove, onSave }: LoopRowProps) => {
  const [confirming, setConfirming] = useState(false)
  const [editing, setEditing] = useState(false)
  const lastStatus = lastStatusText(loop.lastStatus)

  if (editing)
    return (
      <LoopForm
        initial={loop}
        submitLabel="保存"
        aria-label={`编辑任务 ${loop.id}`}
        onSubmit={async value => {
          await onSave(value)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
        className="bg-ui-panel/50 p-4"
      />
    )

  return (
    <div className="px-4 py-3 transition-colors hover:bg-ui-panel">
      <p className="whitespace-pre-wrap break-words text-[13px] leading-5 text-ui-text">
        {loop.message}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs md:text-[11px] text-ui-muted">
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${loop.enabled ? 'bg-ui-success' : 'bg-ui-border'}`}
        />
        <span>{loop.enabled ? '已启用' : '已暂停'}</span>
        <span aria-hidden="true">·</span>
        <span className="font-mono">每 {formatInterval(loop.intervalSec)}</span>
        <span aria-hidden="true">·</span>
        <span>上下文：{contextText(loop.clearEveryRuns)}</span>
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
            onClick={() => setEditing(true)}
            className="ui-quiet-button"
          >
            编辑
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onToggle()}
            className="ui-quiet-button"
          >
            {loop.enabled ? '暂停' : '恢复'}
          </button>
          {confirming ? (
            <span className="flex items-center gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => void onRemove().then(removed => removed && setConfirming(false))}
                className="ui-quiet-button ui-danger"
              >
                确认删除
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirming(false)}
                className="ui-quiet-button"
              >
                取消
              </button>
            </span>
          ) : (
            <button
              type="button"
              aria-label="删除定时任务"
              title="删除定时任务"
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
      setActionError(error instanceof Error ? error.message : '定时任务操作失败')
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto text-sm">
      <div className="shrink-0">
        {loading && <p className="px-4 py-6 text-center text-ui-muted">加载中…</p>}
        {!loading && loops?.length === 0 && (
          <p className="px-4 py-6 text-center text-ui-muted">还没有定时任务。</p>
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
                onSave={async patch => {
                  await api.loops.update(loop.id, patch)
                }}
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
          {actionError ?? `无法刷新定时任务：${loadError?.message}`}
        </p>
      )}
      <LoopForm
        submitLabel="创建任务"
        aria-label="新建定时任务"
        onSubmit={async value => {
          await api.loops.create(sessionId, value)
        }}
        className="shrink-0 border-t border-ui-border bg-ui-panel/50 p-4"
      />
    </div>
  )
}
