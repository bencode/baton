import type { Id, SessionView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { Modal } from '../../components/modal'
import { useWorkers } from '../workers/use-workers'
import { createSessionOnWorker, readLastWorker } from './session-create'

type NewSessionDialogProps = {
  projectId: Id
  onCreated(session: SessionView): void
  onManageWorkers(): void
  onClose(): void
}

export const NewSessionDialog = ({
  projectId,
  onCreated,
  onManageWorkers,
  onClose,
}: NewSessionDialogProps) => {
  const api = useApi()
  const workers = useWorkers(projectId)
  const [remembered] = useState(() => readLastWorker(projectId))
  const [choice, setChoice] = useState<Id | null | undefined>(undefined)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedId =
    choice === undefined
      ? (workers.data?.find(worker => worker.id === remembered && worker.connected)?.id ?? null)
      : choice
  const selected = workers.data?.find(worker => worker.id === selectedId && worker.connected)
  const lifecycle = useRef<{ alive: boolean } | null>(null)
  useEffect(() => {
    const current = { alive: true }
    lifecycle.current = current
    return () => {
      current.alive = false
    }
  }, [])
  const create = async () => {
    if (!selected || creating) return
    const current = lifecycle.current
    setCreating(true)
    setError(null)
    try {
      const session = await createSessionOnWorker(api, projectId, selected.id)
      if (current?.alive) onCreated(session)
    } catch (cause) {
      if (current?.alive) setError(cause instanceof Error ? cause.message : String(cause))
      else console.error('[sessions] creation failed after dialog closed', cause)
    } finally {
      if (current?.alive) setCreating(false)
    }
  }
  return (
    <Modal title="新会话" onClose={onClose} className="mg-dialog">
      <p className="mb-4 text-sm text-ui-muted">选择本次会话使用的执行环境，创建后不能更换。</p>
      {workers.loading && workers.data === null && (
        <p role="status" className="py-4 text-sm text-ui-muted">
          加载执行环境…
        </p>
      )}
      {workers.error && (
        <p role="alert" className="mb-3 text-sm text-ui-danger">
          无法刷新执行环境。{' '}
          <button type="button" onClick={workers.refresh} className="underline">
            重试
          </button>
        </p>
      )}
      {workers.data && (
        <fieldset disabled={creating} className="min-w-0 space-y-2">
          <legend className="sr-only">执行环境</legend>
          {workers.data.map(worker => (
            <label
              key={worker.id}
              className={`flex items-center gap-3 rounded-md border p-3 ${selectedId === worker.id ? 'border-ui-accent bg-ui-selected' : 'border-ui-border'} ${worker.connected ? 'cursor-pointer' : 'text-ui-muted'}`}
            >
              <input
                type="radio"
                name="worker"
                value={worker.id}
                checked={selectedId === worker.id}
                disabled={!worker.connected}
                onChange={() => setChoice(worker.id)}
                className="accent-ui-accent"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium" title={worker.name}>
                  {worker.name}
                </span>
                <span className="block truncate text-xs text-ui-muted" title={worker.hostname}>
                  {worker.agentKind === 'codex' ? 'Codex' : 'Claude Code'} · {worker.hostname}
                </span>
              </span>
              <span className="shrink-0 text-xs text-ui-muted">
                {worker.connected ? '在线' : '离线'}
              </span>
            </label>
          ))}
          {workers.data.length === 0 && (
            <p className="rounded-md bg-ui-panel p-4 text-sm text-ui-muted">
              此项目还没有执行环境，请先添加一个。
            </p>
          )}
          {workers.data.length > 0 && !workers.data.some(worker => worker.connected) && (
            <p className="text-sm text-ui-muted">
              当前没有在线的执行环境，请等待连接或添加其他环境。
            </p>
          )}
          {remembered !== null &&
            workers.data.some(worker => worker.id === remembered && !worker.connected) &&
            choice === undefined && (
              <p className="text-sm text-ui-muted">
                上次使用的执行环境已离线，请选择一个在线环境。
              </p>
            )}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-ui-danger">
          {error}
        </p>
      )}
      <div className="mg-form-actions">
        <button
          type="button"
          disabled={creating}
          onClick={onManageWorkers}
          className="ui-quiet-button mr-auto"
        >
          管理执行环境
        </button>
        <button type="button" onClick={onClose} className="ui-button">
          取消
        </button>
        <button
          type="button"
          disabled={!selected || creating}
          onClick={() => void create()}
          className="ui-button ui-primary min-w-0"
        >
          {creating ? '创建中…' : '创建会话'}
        </button>
      </div>
    </Modal>
  )
}
