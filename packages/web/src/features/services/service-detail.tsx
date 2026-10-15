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

  if (loading && services === null) return <div className="p-6 text-xs text-ui-muted">loading…</div>
  if (error && services === null)
    return (
      <div role="alert" className="p-6 text-sm text-ui-danger">
        Unable to load service details.
      </div>
    )
  if (!service)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-medium text-ui-text">Service is no longer running.</p>
        <p className="text-xs text-ui-muted">Its runtime metadata has expired or been removed.</p>
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
      setConfirming(false)
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
    <div className="ui-page flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-ui-muted">
            Service ·{' '}
            <span className="font-mono">
              W-{workerId}/{name}
            </span>
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <span
              role="img"
              aria-label="running"
              className="h-2 w-2 shrink-0 rounded-full bg-ui-success"
            />
            <h2 className="ui-page-title truncate">{name}</h2>
            <span className="text-xs font-medium text-ui-success">Running</span>
          </div>
        </div>
        {confirming ? (
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-ui-muted">{stopping ? 'Stopping…' : `Stop ${name}?`}</span>
            {!stopping && (
              <>
                <button
                  type="button"
                  onClick={() => void stop()}
                  className="ui-button ui-danger-primary"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="ui-quiet-button"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className="ui-button ui-danger">
            Stop service
          </button>
        )}
      </header>

      {error && (
        <p role="status" className="text-xs text-ui-warning">
          Service details may be out of date.
        </p>
      )}
      {stopError && (
        <p role="alert" className="text-sm text-ui-danger">
          Couldn’t stop {name}.
        </p>
      )}

      <dl className="divide-y divide-ui-border border-y border-ui-border">
        <DetailRow label="Public URL">
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
                {copyStatus === 'copied' ? 'Copied' : 'Copy'}
              </button>
              {copyStatus === 'error' && (
                <span role="status" className="text-xs text-ui-danger">
                  Copy failed
                </span>
              )}
            </div>
          ) : (
            '—'
          )}
        </DetailRow>
        <DetailRow label="Note">
          {service.note ? <p className="max-w-[70ch] whitespace-pre-wrap">{service.note}</p> : '—'}
        </DetailRow>
        <DetailRow label="Worker">
          <span className="font-medium">{worker?.name ?? `W-${workerId}`}</span>{' '}
          <span className="font-mono text-xs text-ui-muted">W-{workerId}</span>
        </DetailRow>
        <DetailRow label="Working directory">
          <span className="break-all font-mono">{service.cwd}</span>
        </DetailRow>
        <DetailRow label="Started">{formatServiceStartedAt(service.startedAt)}</DetailRow>
        <DetailRow label="Uptime">{formatServiceUptime(service.startedAt)}</DetailRow>
      </dl>
    </div>
  )
}
