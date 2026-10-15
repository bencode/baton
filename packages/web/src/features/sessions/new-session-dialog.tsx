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
    <Modal title="New conversation" onClose={onClose} className="max-w-lg">
      <p className="mb-4 text-sm text-ui-muted">
        Choose a worker for this conversation. Its execution environment cannot be changed later.
      </p>
      {workers.loading && workers.data === null && (
        <p role="status" className="py-4 text-sm text-ui-muted">
          Loading workers…
        </p>
      )}
      {workers.error && (
        <p role="alert" className="mb-3 text-sm text-ui-danger">
          Unable to refresh workers.{' '}
          <button type="button" onClick={workers.refresh} className="underline">
            Retry
          </button>
        </p>
      )}
      {workers.data && (
        <fieldset disabled={creating} className="min-w-0 space-y-2">
          <legend className="sr-only">Worker</legend>
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
                {worker.connected ? 'Online' : 'Offline'}
              </span>
            </label>
          ))}
          {workers.data.length === 0 && (
            <p className="rounded-md bg-ui-panel p-4 text-sm text-ui-muted">
              This project has no workers yet. Add one to start a conversation.
            </p>
          )}
          {workers.data.length > 0 && !workers.data.some(worker => worker.connected) && (
            <p className="text-sm text-ui-muted">
              No workers are online. Reconnect a worker or add another one.
            </p>
          )}
          {remembered !== null &&
            workers.data.some(worker => worker.id === remembered && !worker.connected) &&
            choice === undefined && (
              <p className="text-sm text-ui-muted">
                Your last used worker is offline. Choose an online worker.
              </p>
            )}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-ui-danger">
          {error}
        </p>
      )}
      <div className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-2 md:flex md:items-center">
        <button
          type="button"
          disabled={creating}
          onClick={onManageWorkers}
          className="ui-quiet-button col-span-2 mb-2 justify-self-start md:mr-auto md:mb-0"
        >
          Manage workers
        </button>
        <button type="button" onClick={onClose} className="ui-button">
          Cancel
        </button>
        <button
          type="button"
          disabled={!selected || creating}
          onClick={() => void create()}
          className="ui-button ui-primary min-w-0"
        >
          {creating ? 'Creating…' : 'Create conversation'}
        </button>
      </div>
    </Modal>
  )
}
