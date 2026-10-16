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
  const confirmStop = async () => {
    if (stopping) return
    setStopping(true)
    setError(false)
    try {
      await stop()
      setConfirming(false)
    } catch {
      setError(true)
    } finally {
      setStopping(false)
    }
  }
  return (
    <div className={`mg-resource-row ${active ? 'bg-ui-selected text-ui-selected-text' : ''}`}>
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={open}
          aria-current={active ? 'page' : undefined}
          className="ui-focus flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-md text-left"
        >
          <span
            role="img"
            aria-label="运行中"
            className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ui-success"
          />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="mg-resource-title truncate" title={service.name}>
                {service.name}
              </span>
              <span className="ml-auto shrink-0 text-xs text-ui-muted tabular-nums">
                {formatServiceUptime(service.startedAt)}
              </span>
            </span>
            <span className="mg-resource-meta block" title={service.cwd}>
              {workerName} · {service.cwd}
            </span>
          </span>
        </button>
        <button
          type="button"
          aria-label={`停止 ${service.name}`}
          title="停止服务"
          onClick={() => {
            setConfirming(true)
            setError(false)
          }}
          disabled={stopping}
          className="ui-icon-button ui-danger"
        >
          <StopIcon />
        </button>
      </div>
      {confirming && (
        <div className="mg-confirm">
          <p>确认停止“{service.name}”？此操作会停止正在运行的服务进程。</p>
          <div className="mg-form-actions">
            <button
              type="button"
              aria-label={`取消停止 ${service.name}`}
              onClick={() => setConfirming(false)}
              disabled={stopping}
              className="ui-button"
            >
              取消
            </button>
            <button
              type="button"
              aria-label={`确认停止 ${service.name}`}
              onClick={() => void confirmStop()}
              disabled={stopping}
              className="ui-button ui-danger"
            >
              {stopping ? '停止中…' : '确认停止'}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-ui-danger">
          无法停止 {service.name}，请稍后重试。
        </p>
      )}
    </div>
  )
}
