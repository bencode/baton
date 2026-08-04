import type { ServicePresence } from '@baton/shared'
import { useState } from 'react'
import { StopIcon } from '../../components/icons'

type ServiceRowProps = {
  service: ServicePresence
  workerName: string
  sessionName: string
  openSession?: () => void
  stop: () => Promise<void>
}

const formatUptime = (startedAt: number, now = Date.now()): string => {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  if (seconds >= 86400) return `${Math.floor(seconds / 86400)}d`
  if (seconds >= 3600) return `${Math.floor(seconds / 3600)}h`
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
  return `${seconds}s`
}

export const ServiceRow = ({
  service,
  workerName,
  sessionName,
  openSession,
  stop,
}: ServiceRowProps) => {
  const [confirming, setConfirming] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState(false)

  const content = (
    <>
      <span
        role="img"
        aria-label="running"
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-gray-700">{service.name}</span>
          <span className="ml-auto shrink-0 text-[10px] text-gray-500 tabular-nums">
            {formatUptime(service.startedAt)}
          </span>
        </span>
        <span className="block truncate text-[11px] text-gray-500">
          {workerName} · {sessionName}
        </span>
      </span>
    </>
  )

  const confirmStop = async () => {
    if (stopping) return
    setStopping(true)
    setError(false)
    try {
      await stop()
    } catch {
      setStopping(false)
      setConfirming(false)
      setError(true)
    }
  }

  return (
    <div className="group rounded-md px-1 py-0.5 hover:bg-gray-100/70">
      <div className="flex items-center gap-1">
        {openSession ? (
          <button
            type="button"
            onClick={openSession}
            className="flex min-w-0 flex-1 items-start gap-2 py-1 text-left"
          >
            {content}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 items-start gap-2 py-1">{content}</div>
        )}
        {confirming ? (
          <span className="flex shrink-0 items-center gap-2 pl-1 text-[11px]">
            <span className="text-gray-500">{stopping ? 'stopping…' : 'stop?'}</span>
            {!stopping && (
              <>
                <button
                  type="button"
                  aria-label={`confirm stop ${service.name}`}
                  title="stop service"
                  onClick={() => void confirmStop()}
                  className="text-red-500 transition-colors hover:text-red-700"
                >
                  ✓
                </button>
                <button
                  type="button"
                  aria-label={`cancel stop ${service.name}`}
                  title="cancel"
                  onClick={() => setConfirming(false)}
                  className="text-gray-500 transition-colors hover:text-gray-700"
                >
                  ✕
                </button>
              </>
            )}
          </span>
        ) : (
          <button
            type="button"
            aria-label={`stop ${service.name}`}
            title="stop service"
            onClick={() => setConfirming(true)}
            className="shrink-0 p-1 text-gray-400 opacity-0 transition-opacity hover:text-red-600 focus:opacity-100 group-hover:opacity-100"
          >
            <StopIcon />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="pb-1 pl-3 text-[11px] text-red-600">
          Couldn’t stop {service.name}.
        </p>
      )}
    </div>
  )
}
