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
  { id: 'directory', label: '准备目录' },
  { id: 'git', label: '初始化 Git 仓库' },
  { id: 'register', label: '注册执行环境' },
  { id: 'start', label: '启动执行环境' },
  { id: 'connect', label: '连接服务器' },
]

export const creationStatusText = (creation: WorkerCreation): string => {
  const step = steps.find(item => item.id === creation.step)?.label
  if (creation.status === 'pending') return '等待 mini'
  if (creation.status === 'succeeded') return '已创建'
  if (creation.status === 'failed') return step ? `失败：${step}` : '创建失败'
  return step ?? '准备执行环境'
}

type Props = {
  creation: WorkerCreation
  onCreateAnother(input: CreateWorkerInput): void
  onStartConversation(workerId: Id): Promise<void>
}

const CreationSteps = ({ creation }: { creation: WorkerCreation }) => {
  const currentStep = steps.findIndex(item => item.id === creation.step)
  return (
    <ol className="flex flex-col gap-3 text-xs">
      {steps.map((step, index) => {
        const complete = creation.status === 'succeeded' || index < currentStep
        const current = creation.step === step.id
        const failed = current && creation.status === 'failed'
        const status = complete ? '已完成' : failed ? '失败' : current ? '进行中' : '等待'
        return (
          <li
            key={step.id}
            aria-current={current ? 'step' : undefined}
            className="flex justify-between gap-3"
          >
            <span>{step.label}</span>
            <span
              className={failed ? 'text-ui-danger' : complete ? 'text-ui-success' : 'text-ui-muted'}
            >
              {status}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

const CreationResources = ({ creation }: { creation: WorkerCreation }) => {
  if (!creation.repoPath && creation.workerId === null) return null
  return (
    <details className="text-xs text-ui-muted">
      <summary className="cursor-pointer">资源详情</summary>
      <dl className="mt-3 flex flex-col gap-2 break-all">
        {creation.repoPath && (
          <>
            <dt>本地仓库</dt>
            <dd className="font-mono">{creation.repoPath}</dd>
          </>
        )}
        {creation.workerId !== null && (
          <>
            <dt>执行环境 ID</dt>
            <dd>{creation.workerId}</dd>
          </>
        )}
      </dl>
    </details>
  )
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
  const connected =
    workerId !== null &&
    worker.data?.id === workerId &&
    worker.data.connected &&
    worker.data.projectId === creation.projectId &&
    !worker.error
  const workerStatus =
    worker.error instanceof ApiError && worker.error.status === 404
      ? '此执行环境已删除。'
      : worker.error
        ? `无法检查执行环境：${worker.error.message}`
        : worker.loading
          ? '检查连接状态…'
          : connected
            ? '执行环境已连接。'
            : '执行环境已离线，请等待重新连接后再开始会话。'
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="text-[13px] font-medium break-words">{creation.name}</h3>
        <p aria-live="polite" className="mt-1 text-xs text-ui-muted">
          {creationStatusText(creation)}
        </p>
      </div>
      <CreationSteps creation={creation} />
      {creation.status === 'failed' && (
        <div role="alert" className="flex flex-col gap-2 text-xs text-ui-danger break-words">
          <p>{creation.error ?? '执行环境创建失败。'}</p>
          <p>
            已产生的资源会保留，请人工处理失败原因后再重新操作。
            {creation.workerId !== null &&
              ' 已注册的执行环境可能仍占用此名称，请在执行环境页处理。'}
          </p>
        </div>
      )}
      <CreationResources creation={creation} />
      {creation.status === 'succeeded' && (
        <>
          <p
            role={worker.error ? 'alert' : undefined}
            className="text-xs text-ui-muted break-words"
          >
            创建已完成。 {workerId === null ? '此次创建没有关联的执行环境。' : workerStatus}
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
            {starting ? '启动中…' : '开始会话'}
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
          再创建一个执行环境
        </button>
      )}
      {(creation.status === 'pending' || creation.status === 'running') && (
        <p className="text-xs text-ui-muted">
          关闭窗口不会中断创建；已注册的执行环境可在执行环境页查看。
        </p>
      )}
    </div>
  )
}
