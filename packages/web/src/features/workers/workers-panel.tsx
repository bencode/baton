import type { Id, SessionView, WorkerView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { sessionPath } from '../../app/route'
import { createSessionOnWorker } from '../sessions/session-create'
import { AddWorker, type WorkerDialogView } from './add-worker'
import { useWorkerSetup } from './use-worker-setup'
import { WorkerRow } from './worker-row'
import { createErrorText } from './worker-template-form'

type WorkersPanelProps = {
  projectId: Id
  workers: WorkerView[] | null
  sessions: SessionView[] | null
  open: (id: string, title: string) => void
  onSessionsDeleted(sessionIds: readonly Id[]): void
}

export const WorkersPanel = ({
  projectId,
  workers,
  sessions,
  open,
  onSessionsDeleted,
}: WorkersPanelProps) => {
  const api = useApi()
  const [deleted, setDeleted] = useState<Id[]>([])
  const setup = useWorkerSetup(projectId)
  const [view, setView] = useState<WorkerDialogView | null>(null)
  const viewRef = useRef(view)
  viewRef.current = view
  const trigger = useRef<HTMLElement | null>(null)
  const addButton = useRef<HTMLButtonElement | null>(null)
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  const show = (next: WorkerDialogView, element: HTMLElement) => {
    trigger.current = element
    setView(next)
  }
  const dismiss = () => {
    viewRef.current = null
    setView(null)
    const target = trigger.current?.isConnected ? trigger.current : addButton.current
    target?.focus()
  }
  const startConversation = async (workerId: Id) => {
    const requestedView = viewRef.current
    const session = await createSessionOnWorker(api, projectId, workerId)
    if (!alive.current || viewRef.current !== requestedView) return
    dismiss()
    open(sessionPath(projectId, session.id), session.name)
  }
  return (
    <div className="flex flex-col gap-3">
      {workers === null ? (
        <p className="text-sm text-ui-muted">Worker information is not available yet.</p>
      ) : workers.length === 0 ? (
        <p className="rounded-md bg-ui-panel p-4 text-sm text-ui-muted">
          No workers yet. Add a worker from a template or register an existing one.
        </p>
      ) : (
        workers
          .filter(worker => !deleted.includes(worker.id))
          .map(worker => (
            <WorkerRow
              key={worker.id}
              worker={worker}
              sessionCount={
                sessions ? sessions.filter(session => session.workerId === worker.id).length : null
              }
              onDelete={async () => {
                await api.workers.remove(worker.id)
                setDeleted(previous => [...previous, worker.id])
                onSessionsDeleted(
                  (sessions ?? [])
                    .filter(session => session.workerId === worker.id)
                    .map(session => session.id),
                )
              }}
            />
          ))
      )}
      {!view && setup.createError && (
        <p role="alert" className="px-2 text-xs text-red-700">
          {createErrorText(setup.createError)}{' '}
          <button type="button" onClick={setup.refresh} className="underline">
            Refresh records
          </button>
        </p>
      )}
      <button
        ref={addButton}
        type="button"
        onClick={event => show({ kind: 'add' }, event.currentTarget)}
        className="ui-button ui-primary w-fit"
      >
        ＋ Add worker
      </button>
      {view && (
        <AddWorker
          key={view.kind === 'add' ? 'add' : view.creationId}
          projectId={projectId}
          view={view}
          setup={setup}
          onClose={dismiss}
          onCreated={creation => {
            if (alive.current && viewRef.current?.kind === 'add')
              setView({ kind: 'creation', creationId: creation.id })
          }}
          onCreateAnother={initialInput => setView({ kind: 'add', initialInput })}
          onStartConversation={startConversation}
        />
      )}
    </div>
  )
}
