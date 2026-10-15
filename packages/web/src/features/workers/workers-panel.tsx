import type { Id, SessionView, WorkerView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { sessionPath } from '../../app/route'
import { AddWorker, type WorkerDialogView } from './add-worker'
import { useWorkerSetup } from './use-worker-setup'
import { createErrorText } from './worker-template-form'
import { groupByWorker } from './workers-panel/grouping'
import { WorkerGroup } from './workers-panel/worker-group'

type WorkersPanelProps = {
  projectId: Id
  workers: WorkerView[] | null
  sessions: SessionView[] | null
  activeId: string
  open: (id: string, title: string) => void
  close: (id: string) => void
}

export const WorkersPanel = ({
  projectId,
  workers,
  sessions,
  activeId,
  open,
  close,
}: WorkersPanelProps) => {
  const api = useApi()
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
    const worker = await api.workers.get(workerId)
    if (!alive.current) return
    if (worker.projectId !== projectId || !worker.connected)
      throw new Error(
        'This worker is unavailable. Wait for it to reconnect before starting a conversation.',
      )
    const session = await api.sessions.create({ projectId, workerId })
    if (!alive.current) return
    dismiss()
    open(sessionPath(projectId, session.id), session.name)
  }
  const groups = workers && sessions ? groupByWorker(workers, sessions) : null
  return (
    <div className="flex flex-col gap-3">
      {!groups ? (
        <p className="px-2 text-sm text-gray-400">loading…</p>
      ) : workers?.length === 0 ? (
        <p className="px-2 text-sm text-gray-400">No workers yet.</p>
      ) : (
        groups.map(g => (
          <WorkerGroup
            key={g.worker.id}
            worker={g.worker}
            sessions={g.sessions}
            projectId={projectId}
            activeId={activeId}
            open={open}
            close={close}
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
        className="flex w-fit items-center gap-1 px-1 text-xs text-gray-400 transition-colors hover:text-blue-700"
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
