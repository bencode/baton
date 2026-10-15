import type { ServicePresence } from '@baton/shared'
import { useState } from 'react'
import { StopIcon } from '../../components/icons'
import { formatServiceUptime } from './format'

type ServiceRowProps = {
  service: ServicePresence
  workerName: string
  active: boolean
  open: () => void
  stop: () => Promise<void>
}

export const ServiceRow = ({ service, workerName, active, open, stop }: ServiceRowProps) => {
  const [confirming, setConfirming] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [error, setError] = useState(false)

  const content = (
    <>
      <span
        role="img"
        aria-label="running"
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ui-success"
      />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span
            className={`truncate font-medium ${active ? 'text-ui-selected-text' : 'text-ui-text'}`}
          >
            {service.name}
          </span>
          <span className="ml-auto shrink-0 text-xs text-ui-muted tabular-nums">
            {formatServiceUptime(service.startedAt)}
          </span>
        </span>
        <span className="block truncate text-xs text-ui-muted" title={service.cwd}>
          {workerName} · {service.cwd}
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
    <div
      className={`group rounded-md px-1 py-0.5 transition-colors duration-150 ${
        active ? 'bg-ui-selected text-ui-selected-text' : 'hover:bg-ui-hover/70'
      }`}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={open}
          aria-current={active ? 'page' : undefined}
          className="ui-focus flex min-h-11 min-w-0 flex-1 items-start gap-2 rounded-md py-3 text-left text-[13px]"
        >
          {content}
        </button>
        {confirming ? (
          <span className="flex shrink-0 items-center gap-2 pl-1 text-[11px]">
            <span className="text-ui-muted">{stopping ? 'stopping…' : 'stop?'}</span>
            {!stopping && (
              <>
                <button
                  type="button"
                  aria-label={`confirm stop ${service.name}`}
                  title="stop service"
                  onClick={() => void confirmStop()}
                  className="ui-icon-button ui-danger"
                >
                  ✓
                </button>
                <button
                  type="button"
                  aria-label={`cancel stop ${service.name}`}
                  title="cancel"
                  onClick={() => setConfirming(false)}
                  className="ui-icon-button"
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
            className="ui-icon-button ui-danger [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
          >
            <StopIcon />
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="pb-1 pl-3 text-[11px] text-ui-danger">
          Couldn’t stop {service.name}.
        </p>
      )}
    </div>
  )
}
