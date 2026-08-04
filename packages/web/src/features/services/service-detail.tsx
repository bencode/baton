import type { Id } from '@baton/shared'
import { type ReactNode, useState } from 'react'
import { useApi } from '../../app/api-context'
import { sessionPath } from '../../app/route'
import { useSessions } from '../sessions/use-sessions'
import { useWorkers } from '../workers/use-workers'
import { formatServiceStartedAt, formatServiceUptime } from './format'
import { useServices } from './use-services'

type ServiceDetailProps = {
  projectId: Id
  workerId: Id
  name: string
  open: (id: string, title: string) => void
}

const DetailRow = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid gap-1 py-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-4">
    <dt className="text-sm text-gray-500">{label}</dt>
    <dd className="min-w-0 text-sm text-gray-800">{children}</dd>
  </div>
)

export const ServiceDetail = ({ projectId, workerId, name, open }: ServiceDetailProps) => {
  const api = useApi()
  const { data: services, loading, error, refresh } = useServices(projectId)
  const { data: workers } = useWorkers(projectId)
  const { data: sessions } = useSessions(projectId)
  const [confirming, setConfirming] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [stopError, setStopError] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const service = services?.find(item => item.workerId === workerId && item.name === name)

  if (loading && services === null) return <div className="p-6 text-sm text-gray-500">loading…</div>
  if (error && services === null)
    return (
      <div role="alert" className="p-6 text-sm text-red-600">
        Unable to load service details.
      </div>
    )
  if (!service)
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-medium text-gray-700">Service is no longer running.</p>
        <p className="text-xs text-gray-500">Its runtime metadata has expired or been removed.</p>
      </div>
    )

  const worker = workers?.find(item => item.id === workerId)
  const session = sessions?.find(item => item.id === service.sessionId)

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-gray-500">
            Service ·{' '}
            <span className="font-mono">
              W-{workerId}/{name}
            </span>
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2">
            <span
              role="img"
              aria-label="running"
              className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
            />
            <h2 className="truncate text-xl font-semibold tracking-tight text-gray-900">{name}</h2>
            <span className="text-xs font-medium text-emerald-700">Running</span>
          </div>
        </div>
        {confirming ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">{stopping ? 'Stopping…' : `Stop ${name}?`}</span>
            {!stopping && (
              <>
                <button
                  type="button"
                  onClick={() => void stop()}
                  className="rounded-md bg-red-600 px-2.5 py-1.5 font-medium text-white hover:bg-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                >
                  Stop
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="rounded-md px-2.5 py-1.5 text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          >
            Stop service
          </button>
        )}
      </header>

      {error && (
        <p role="status" className="text-xs text-amber-700">
          Service details may be out of date.
        </p>
      )}
      {stopError && (
        <p role="alert" className="text-sm text-red-600">
          Couldn’t stop {name}.
        </p>
      )}

      <dl className="divide-y divide-gray-100 border-y border-gray-100">
        <DetailRow label="Public URL">
          {service.publicUrl ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <a
                href={service.publicUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="break-all font-medium text-blue-700 underline decoration-blue-200 underline-offset-2 hover:decoration-blue-700"
              >
                {service.publicUrl}
              </a>
              <button
                type="button"
                onClick={() => void copyPublicUrl()}
                className="text-xs font-medium text-gray-500 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
              >
                {copyStatus === 'copied' ? 'Copied' : 'Copy'}
              </button>
              {copyStatus === 'error' && (
                <span role="status" className="text-xs text-red-600">
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
          <span className="font-mono text-xs text-gray-500">W-{workerId}</span>
        </DetailRow>
        <DetailRow label="Session">
          {session ? (
            <button
              type="button"
              onClick={() => open(sessionPath(projectId, session.id), session.name)}
              className="font-medium text-blue-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              {session.name}
            </button>
          ) : (
            <span className="text-gray-500">session #{service.sessionId}</span>
          )}
        </DetailRow>
        <DetailRow label="Started">{formatServiceStartedAt(service.startedAt)}</DetailRow>
        <DetailRow label="Uptime">{formatServiceUptime(service.startedAt)}</DetailRow>
      </dl>
    </div>
  )
}
