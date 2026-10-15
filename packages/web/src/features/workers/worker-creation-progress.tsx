import type {
  CreateWorkerInput,
  Id,
  WorkerCreation,
  WorkerCreationStep,
  WorkerView,
} from '@baton/shared'
import { useEffect, useState } from 'react'
import { ApiError } from '../../api'
import { useApi } from '../../app/api-context'
import type { AsyncState } from '../../hooks/use-async'

const steps: { id: WorkerCreationStep; label: string }[] = [
  { id: 'directory', label: 'Prepare directory' },
  { id: 'git', label: 'Initialize Git repository' },
  { id: 'register', label: 'Register worker' },
  { id: 'start', label: 'Start worker' },
  { id: 'connect', label: 'Connect to server' },
]

export const creationStatusText = (creation: WorkerCreation): string => {
  const step = steps.find(item => item.id === creation.step)?.label
  if (creation.status === 'pending') return 'Waiting for mini'
  if (creation.status === 'succeeded') return 'Created'
  if (creation.status === 'failed') return step ? `Failed: ${step}` : 'Creation failed'
  return step ?? 'Preparing worker'
}

type Props = {
  creation: WorkerCreation
  onCreateAnother(input: CreateWorkerInput): void
  onStartConversation(workerId: Id): Promise<void>
}

export const WorkerCreationProgress = ({
  creation,
  onCreateAnother,
  onStartConversation,
}: Props) => {
  const api = useApi()
  const workerId = creation.status === 'succeeded' ? creation.workerId : null
  const [worker, setWorker] = useState<AsyncState<WorkerView>>({
    data: null,
    loading: true,
    error: null,
  })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<Error | null>(null)
  useEffect(() => {
    if (workerId === null) return
    let alive = true
    let sequence = 0
    setWorker({ data: null, loading: true, error: null })
    const load = async () => {
      const request = ++sequence
      try {
        const data = await api.workers.get(workerId)
        if (alive && request === sequence) setWorker({ data, loading: false, error: null })
      } catch (error) {
        console.error('[worker-creation] worker check failed', error)
        if (alive && request === sequence)
          setWorker({
            data: null,
            loading: false,
            error: error instanceof Error ? error : new Error(String(error)),
          })
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 5000)
    return () => {
      alive = false
      window.clearInterval(timer)
    }
  }, [api, workerId])
  const start = async () => {
    setStarting(true)
    setStartError(null)
    try {
      if (workerId !== null) await onStartConversation(workerId)
    } catch (error) {
      console.error('[worker-creation] start conversation failed', error)
      setStartError(error instanceof Error ? error : new Error(String(error)))
    } finally {
      setStarting(false)
    }
  }
  const currentStep = steps.findIndex(item => item.id === creation.step)
  const connected =
    workerId !== null &&
    worker.data?.id === workerId &&
    worker.data.connected &&
    worker.data.projectId === creation.projectId &&
    !worker.error
  const workerStatus =
    worker.error instanceof ApiError && worker.error.status === 404
      ? 'This worker has been deleted.'
      : worker.error
        ? `Could not check the worker: ${worker.error.message}`
        : worker.loading
          ? 'Checking worker connection…'
          : connected
            ? 'Worker is connected.'
            : 'Worker is offline. Wait for it to reconnect before starting a conversation.'
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium break-words">{creation.name}</h3>
        <p aria-live="polite" className="mt-1 text-xs text-ui-muted">
          {creationStatusText(creation)}
        </p>
      </div>
      <ol className="flex flex-col gap-2 text-xs">
        {steps.map((step, index) => {
          const complete = creation.status === 'succeeded' || index < currentStep
          const current = creation.step === step.id
          const status = complete
            ? 'Done'
            : current
              ? creation.status === 'failed'
                ? 'Failed'
                : 'In progress'
              : 'Waiting'
          return (
            <li
              key={step.id}
              aria-current={current ? 'step' : undefined}
              className="flex justify-between gap-3"
            >
              <span>{step.label}</span>
              <span
                className={
                  status === 'Failed'
                    ? 'text-ui-danger'
                    : status === 'Done'
                      ? 'text-ui-success'
                      : 'text-ui-muted'
                }
              >
                {status}
              </span>
            </li>
          )
        })}
      </ol>
      {creation.status === 'failed' && (
        <div role="alert" className="flex flex-col gap-2 text-xs text-ui-danger break-words">
          <p>{creation.error ?? 'Worker creation failed.'}</p>
          <p>
            Resources are retained. Resolve the failure manually before submitting a new request.
            {creation.workerId !== null &&
              ' The registered worker may still occupy this name; manage it in the Workers sidebar.'}
          </p>
        </div>
      )}
      {(creation.repoPath || creation.workerId !== null) && (
        <details className="text-xs text-ui-muted">
          <summary className="cursor-pointer">Resource details</summary>
          <dl className="mt-2 flex flex-col gap-1 break-all">
            {creation.repoPath && (
              <>
                <dt>Local repository</dt>
                <dd>{creation.repoPath}</dd>
              </>
            )}
            {creation.workerId !== null && (
              <>
                <dt>Worker ID</dt>
                <dd>{creation.workerId}</dd>
              </>
            )}
          </dl>
        </details>
      )}
      {creation.status === 'succeeded' && (
        <>
          <p
            role={worker.error ? 'alert' : undefined}
            className="text-xs text-ui-muted break-words"
          >
            Creation completed.{' '}
            {workerId === null ? 'No worker is associated with this record.' : workerStatus}
          </p>
          {startError && (
            <p role="alert" className="text-xs text-ui-danger break-words">
              {startError.message}
            </p>
          )}
          <button
            type="button"
            onClick={() => void start()}
            disabled={!connected || starting}
            className="ui-button ui-primary w-fit"
          >
            {starting ? 'Starting…' : 'Start conversation'}
          </button>
        </>
      )}
      {(creation.status === 'succeeded' || creation.status === 'failed') && (
        <button
          type="button"
          onClick={() =>
            onCreateAnother({
              templateId: creation.templateId,
              name: creation.name,
              agentKind: creation.agentKind,
            })
          }
          className="w-fit text-xs text-ui-muted underline"
        >
          Create another worker
        </button>
      )}
      {(creation.status === 'pending' || creation.status === 'running') && (
        <p className="text-xs text-ui-muted">
          You can close this window. Creation continues on the mini; reopen its status in the
          Workers sidebar.
        </p>
      )}
    </div>
  )
}
