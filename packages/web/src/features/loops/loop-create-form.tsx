import type { Id } from '@baton/shared'
import { useId, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { SelectControl } from '../../components/select-control'
import { useAutosize } from '../../hooks/use-autosize'
import {
  ContextClearInput,
  contextClearDraft,
  contextClearError,
  contextClearSeconds,
} from './context-clear-input'
import { type IntervalUnit, intervalError, toSeconds } from './format'

const intervalErrorText = (error: string | null): string | null => {
  if (error === 'max 90d') return 'The interval cannot exceed 90 days.'
  if (error) return 'The interval must be at least 30 seconds.'
  return null
}

export const LoopCreateForm = ({ sessionId }: { sessionId: Id }) => {
  const api = useApi()
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messageId = useId()
  const intervalErrorId = useId()
  const [message, setMessage] = useState('')
  const [value, setValue] = useState('30')
  const [unit, setUnit] = useState<IntervalUnit>('min')
  const [clear, setClear] = useState(() => contextClearDraft())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useAutosize(textareaRef, message, 160)

  const intervalSec = toSeconds(Number(value), unit)
  const intervalMessage = intervalErrorText(intervalError(intervalSec))
  const canCreate =
    message.trim().length > 0 &&
    intervalMessage === null &&
    contextClearError(clear) === null &&
    !busy

  const create = async () => {
    if (!canCreate) return
    setBusy(true)
    setError(null)
    try {
      await api.loops.create(sessionId, {
        message: message.trim(),
        intervalSec,
        ...(clear.enabled ? { clearAfterSec: contextClearSeconds(clear) } : {}),
      })
      setMessage('')
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create task')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        void create()
      }}
      className="shrink-0 border-t border-ui-border bg-ui-panel/50 p-4"
    >
      <label htmlFor={messageId} className="text-xs font-medium text-ui-text">
        Message <span className="font-normal text-ui-muted">(required)</span>
      </label>
      <textarea
        ref={textareaRef}
        id={messageId}
        rows={3}
        required
        value={message}
        onChange={event => setMessage(event.target.value)}
        placeholder="What should the agent do on each run?"
        className="ui-textarea mt-2 max-h-40 min-h-24 w-full resize-none overflow-y-auto px-3 py-2"
      />
      <div className="mt-4">
        <label className="flex min-w-0 flex-col gap-2 text-xs font-medium text-ui-text">
          Run every
          <span className="flex min-w-0">
            <input
              type="number"
              min={1}
              step={1}
              required
              value={value}
              onChange={event => setValue(event.target.value)}
              aria-label="interval value"
              aria-describedby={intervalMessage ? intervalErrorId : undefined}
              className="ui-input min-w-0 w-0 flex-1 rounded-r-none border-r-0"
            />
            <SelectControl
              value={unit}
              onChange={event => setUnit(event.target.value as IntervalUnit)}
              aria-label="interval unit"
              className="w-28 shrink-0 rounded-l-none"
            >
              <option value="sec">seconds</option>
              <option value="min">minutes</option>
              <option value="hour">hours</option>
              <option value="day">days</option>
            </SelectControl>
          </span>
        </label>
      </div>
      {intervalMessage && (
        <p id={intervalErrorId} className="mt-1.5 text-xs text-ui-warning">
          {intervalMessage}
        </p>
      )}
      <div className="mt-4">
        <ContextClearInput value={clear} onChange={setClear} disabled={busy} />
      </div>
      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={!canCreate}
          className="ui-button ui-primary h-9 w-full md:w-auto"
        >
          {busy ? 'Creating…' : 'Create task'}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-ui-danger">
          {error}
        </p>
      )}
    </form>
  )
}
