import type { Id } from '@baton/shared'
import { useId, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useAutosize } from '../../hooks/use-autosize'
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
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useAutosize(textareaRef, message, 160)

  const intervalSec = toSeconds(Number(value), unit)
  const intervalMessage = intervalErrorText(intervalError(intervalSec))
  const canCreate = message.trim().length > 0 && intervalMessage === null && !busy

  const create = async () => {
    if (!canCreate) return
    setBusy(true)
    setError(null)
    try {
      await api.loops.create(sessionId, { message: message.trim(), intervalSec })
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
      className="shrink-0 border-t border-gray-200 bg-gray-50/70 px-4 py-3"
    >
      <label htmlFor={messageId} className="text-xs font-medium text-gray-700">
        Message <span className="font-normal text-gray-500">(required)</span>
      </label>
      <textarea
        ref={textareaRef}
        id={messageId}
        // biome-ignore lint/a11y/noAutofocus: the form opens after an explicit click
        autoFocus
        rows={3}
        required
        value={message}
        onChange={event => setMessage(event.target.value)}
        placeholder="What should the agent do on each run?"
        className="mt-1 max-h-40 min-h-20 w-full resize-none overflow-y-auto rounded-md border border-gray-300 bg-white px-3 py-2 text-base leading-5 text-gray-800 outline-none placeholder:text-gray-500 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 sm:text-sm"
      />
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs font-medium text-gray-700">
          Run every
          <span className="flex">
            <input
              type="number"
              min={1}
              step={1}
              required
              value={value}
              onChange={event => setValue(event.target.value)}
              aria-label="interval value"
              aria-describedby={intervalMessage ? intervalErrorId : undefined}
              className="min-w-0 flex-1 rounded-l-md border border-r-0 border-gray-300 bg-white px-2 py-1.5 text-base text-gray-800 outline-none focus-visible:z-10 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 sm:text-sm"
            />
            <select
              value={unit}
              onChange={event => setUnit(event.target.value as IntervalUnit)}
              aria-label="interval unit"
              className="rounded-r-md border border-gray-300 bg-white px-2 py-1.5 text-base text-gray-800 outline-none focus-visible:z-10 focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20 sm:text-sm"
            >
              <option value="sec">seconds</option>
              <option value="min">minutes</option>
              <option value="hour">hours</option>
              <option value="day">days</option>
            </select>
          </span>
        </label>
        <button
          type="submit"
          disabled={!canCreate}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? 'Creating…' : 'Create task'}
        </button>
      </div>
      {intervalMessage && (
        <p id={intervalErrorId} className="mt-1.5 text-xs text-amber-700">
          {intervalMessage}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1.5 text-xs text-red-700">
          {error}
        </p>
      )}
    </form>
  )
}
