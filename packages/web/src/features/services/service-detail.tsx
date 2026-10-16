import type { Id } from '@baton/shared'
import { type ReactNode, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useWorkers } from '../workers/use-workers'
import { formatServiceStartedAt, formatServiceUptime } from './format'
import { useServices } from './use-services'

type ServiceDetailProps = {
  projectId: Id
  workerId: Id
  name: string
}

const DetailRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-1 py-3 md:grid-cols-[8rem_minmax(0,1fr)] md:gap-4">
    <dt className="text-xs text-ui-muted">{label}</dt>
    <dd className="min-w-0 text-[13px] leading-5 text-ui-text">{children}</dd>
  </div>
)

export const ServiceDetail = ({ projectId, workerId, name }: ServiceDetailProps) => {
  const api = useApi()
  const { data: services, loading, error, refresh } = useServices(projectId)
  const { data: workers } = useWorkers(projectId)
  const [confirming, setConfirming] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const service = services?.find(item => item.workerId === workerId && item.name === name)

  if (loading && services === null)
    return (
      <div role="status" className="ui-page mg-page text-sm text-ui-muted">
        加载服务…
      </div>
    )
  if (error && services === null)
    return (
      <div role="alert" className="p-6 text-sm text-ui-danger">
        无法加载服务详情。
        <button type="button" onClick={refresh} className="ml-2 underline">
          重试
        </button>
      </div>
    )
  if (!service)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-medium text-ui-text">服务已结束运行。</p>
        <p className="text-xs text-ui-muted">运行信息已过期或移除。</p>
      </div>
    )

  const worker = workers?.find(item => item.id === workerId)

  const stop = async () => {
    if (stopping) return
    setStopping(true)
    setStopError(false)
    try {
      await api.services.stop(workerId, name)
      setStopping(false)
      setConfirming(false)
      refresh()
    } catch {
      setStopping(false)
      setStopError(true)
    }
  }

  const copyPublicUrl = async () => {
    if (!service.publicUrl || !navigator.clipboard) {
      setCopyStatus('error')
      return
    }
    try {
      await navigator.clipboard.writeText(service.publicUrl)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <div className="ui-page mg-page mg-detail">
      <header className="mg-page-header">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <span
              role="img"
              aria-label="运行中"
              className="h-2 w-2 shrink-0 rounded-full bg-ui-success"
            />
            <h2 className="ui-page-title truncate" title={name}>
              {name}
            </h2>
            <span className="text-xs font-medium text-ui-success">运行中</span>
          </div>
          <p className="mg-description break-all">
            服务 ·{' '}
            <span className="font-mono">
              W-{workerId}/{name}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={stopping}
          className="ui-button ui-danger shrink-0"
        >
          停止服务
        </button>
      </header>

      {confirming && (
        <div className="mg-confirm">
          <p>确认停止“{name}”？此操作会停止正在运行的服务进程。</p>
          <div className="mg-form-actions">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={stopping}
              className="ui-button"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => void stop()}
              disabled={stopping}
              className="ui-button ui-danger"
            >
              {stopping ? '停止中…' : '确认停止'}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p role="status" className="text-xs text-ui-warning">
          服务详情可能不是最新状态。
        </p>
      )}
      {stopError && (
        <p role="alert" className="text-sm text-ui-danger">
          无法停止 {name}，请稍后重试。
        </p>
      )}

      <dl className="divide-y divide-ui-border border-y border-ui-border">
        <DetailRow label="公开地址">
          {service.publicUrl ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a
                href={service.publicUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all font-medium text-ui-accent underline decoration-ui-accent-border underline-offset-2 hover:decoration-ui-accent"
              >
                {service.publicUrl}
              </a>
              <button
                type="button"
                onClick={() => void copyPublicUrl()}
                className="ui-quiet-button"
              >
                {copyStatus === 'copied' ? '已复制' : '复制'}
              </button>
              {copyStatus === 'error' && (
                <span role="status" className="text-xs text-ui-danger">
                  复制失败
                </span>
              )}
            </div>
          ) : (
            '—'
          )}
        </DetailRow>
        <DetailRow label="备注">
          {service.note ? <p className="max-w-[70ch] whitespace-pre-wrap">{service.note}</p> : '—'}
        </DetailRow>
        <DetailRow label="执行环境">
          <span className="font-medium">{worker?.name ?? `W-${workerId}`}</span>{' '}
          <span className="font-mono text-xs text-ui-muted">W-{workerId}</span>
        </DetailRow>
        <DetailRow label="工作目录">
          <span className="break-all font-mono">{service.cwd}</span>
        </DetailRow>
        <DetailRow label="启动时间">{formatServiceStartedAt(service.startedAt)}</DetailRow>
        <DetailRow label="运行时长">{formatServiceUptime(service.startedAt)}</DetailRow>
      </dl>
    </div>
  )
}
