import type { Loop } from '@baton/shared'
import { useId, useRef, useState } from 'react'
import { SelectControl } from '../../components/select-control'
import { useAutosize } from '../../hooks/use-autosize'
import {
  ContextClearInput,
  contextClearDraft,
  contextClearError,
  contextClearRuns,
} from './context-clear-input'
import { type IntervalUnit, intervalError, toSeconds } from './format'

export type LoopFormValue = { message: string; intervalSec: number; clearEveryRuns: number | null }

const intervalErrorText = (error: string | null): string | null => {
  if (error === 'max 90d') return '间隔不能超过 90 天。'
  if (error) return '间隔至少为 30 秒。'
  return null
}

// Largest whole unit that represents the stored interval exactly.
const intervalDraft = (sec: number): { value: string; unit: IntervalUnit } => {
  const unit =
    (['day', 'hour', 'min'] as const).find(u => sec % toSeconds(1, u) === 0) ?? ('sec' as const)
  return { value: String(sec / toSeconds(1, unit)), unit }
}

type LoopFormProps = {
  // Absent → create (blank form, cleared after a successful submit).
  initial?: Loop
  submitLabel: string
  // Throws to keep the form open with the error shown.
  onSubmit(value: LoopFormValue): Promise<void>
  onCancel?(): void
  'aria-label'?: string
  className?: string
}

export const LoopForm = ({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  'aria-label': ariaLabel,
  className,
}: LoopFormProps) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const messageId = useId()
  const intervalErrorId = useId()
  const [message, setMessage] = useState(initial?.message ?? '')
  const [interval, setIntervalDraft] = useState(() =>
    initial ? intervalDraft(initial.intervalSec) : { value: '30', unit: 'min' as IntervalUnit },
  )
  const [clear, setClear] = useState(() => contextClearDraft(initial?.clearEveryRuns))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useAutosize(textareaRef, message, 160)

  const intervalSec = toSeconds(Number(interval.value), interval.unit)
  const intervalMessage = intervalErrorText(intervalError(intervalSec))
  const canSubmit =
    message.trim().length > 0 && intervalMessage === null && contextClearError(clear) === null

  const submit = async () => {
    if (!canSubmit || busy) return
    setBusy(true)
    setError(null)
    try {
      await onSubmit({
        message: message.trim(),
        intervalSec,
        clearEveryRuns: contextClearRuns(clear),
      })
      if (!initial) setMessage('')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '保存定时任务失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      aria-label={ariaLabel}
      onSubmit={event => {
        event.preventDefault()
        void submit()
      }}
      className={className}
    >
      <label htmlFor={messageId} className="text-xs font-medium text-ui-text">
        消息 <span className="font-normal text-ui-muted">（必填）</span>
      </label>
      <textarea
        ref={textareaRef}
        id={messageId}
        rows={3}
        required
        value={message}
        onChange={event => setMessage(event.target.value)}
        placeholder="每次执行时 agent 要做什么？"
        className="ui-textarea mt-2 max-h-40 min-h-24 w-full resize-none overflow-y-auto px-3 py-2"
      />
      <div className="mt-4">
        <label className="flex min-w-0 flex-col gap-2 text-xs font-medium text-ui-text">
          每隔
          <span className="flex min-w-0">
            <input
              type="number"
              min={1}
              step={1}
              required
              value={interval.value}
              onChange={event => setIntervalDraft({ ...interval, value: event.target.value })}
              aria-label="间隔数值"
              aria-describedby={intervalMessage ? intervalErrorId : undefined}
              className="ui-input min-w-0 w-0 flex-1 rounded-r-none border-r-0"
            />
            <SelectControl
              value={interval.unit}
              onChange={event =>
                setIntervalDraft({ ...interval, unit: event.target.value as IntervalUnit })
              }
              aria-label="间隔单位"
              className="w-28 shrink-0 rounded-l-none"
            >
              <option value="sec">秒</option>
              <option value="min">分钟</option>
              <option value="hour">小时</option>
              <option value="day">天</option>
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
        <ContextClearInput
          value={clear}
          onChange={setClear}
          intervalSec={intervalMessage === null ? intervalSec : null}
          disabled={busy}
        />
      </div>
      <div className="mt-4 flex justify-end gap-2">
        {onCancel && (
          <button type="button" disabled={busy} onClick={onCancel} className="ui-quiet-button">
            取消
          </button>
        )}
        <button
          type="submit"
          disabled={!canSubmit || busy}
          className="ui-button ui-primary h-9 w-full md:w-auto"
        >
          {busy ? '保存中…' : submitLabel}
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
