import { useId } from 'react'
import { formatInterval } from './format'

export type ContextClearMode = 'keep' | 'fresh' | 'every'
export type ContextClearDraft = { mode: ContextClearMode; runs: string }

const MAX_RUNS = 1000 // matches the server ceiling

export const contextClearDraft = (clearEveryRuns?: number): ContextClearDraft => {
  if (clearEveryRuns === undefined) return { mode: 'keep', runs: '4' }
  if (clearEveryRuns === 1) return { mode: 'fresh', runs: '4' }
  return { mode: 'every', runs: String(clearEveryRuns) }
}

const everyRuns = (runs: string): number | null => {
  const n = Number(runs)
  return runs.trim() && Number.isInteger(n) && n >= 1 && n <= MAX_RUNS ? n : null
}

export const contextClearRuns = (draft: ContextClearDraft): number | null => {
  if (draft.mode === 'keep') return null
  if (draft.mode === 'fresh') return 1
  return everyRuns(draft.runs)
}

export const contextClearError = (draft: ContextClearDraft): string | null =>
  draft.mode === 'every' && everyRuns(draft.runs) === null
    ? `请输入 1–${MAX_RUNS} 的整数次数。`
    : null

type ContextClearInputProps = {
  value: ContextClearDraft
  onChange(value: ContextClearDraft): void
  // Run interval in seconds (null while invalid) — drives the "≈ duration" hint.
  intervalSec: number | null
  disabled?: boolean
}

export const ContextClearInput = ({
  value,
  onChange,
  intervalSec,
  disabled,
}: ContextClearInputProps) => {
  const id = useId()
  const error = contextClearError(value)
  const runs = everyRuns(value.runs)
  const radio = (mode: ContextClearMode) => ({
    type: 'radio' as const,
    name: `${id}-mode`,
    checked: value.mode === mode,
    onChange: () => onChange({ ...value, mode }),
    className: 'accent-ui-accent',
  })

  return (
    <fieldset
      disabled={disabled}
      aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
      className="min-w-0 space-y-2"
    >
      <legend className="text-xs font-medium text-ui-text">上下文</legend>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ui-text">
        <label className="flex items-center gap-1.5">
          <input {...radio('keep')} />
          保留
        </label>
        <label className="flex items-center gap-1.5">
          <input {...radio('fresh')} />
          每次执行前清空
        </label>
        <span className="flex items-center gap-1.5">
          <label className="flex items-center gap-1.5">
            <input {...radio('every')} />每
          </label>
          <input
            type="number"
            min={1}
            max={MAX_RUNS}
            step={1}
            aria-label="清空间隔次数"
            aria-invalid={error !== null}
            value={value.runs}
            onChange={event => onChange({ mode: 'every', runs: event.target.value })}
            className="ui-input h-7 w-16 px-2"
          />
          次清空
          {value.mode === 'every' && runs !== null && intervalSec !== null && (
            <span className="text-ui-muted">· 约 {formatInterval(runs * intervalSec)}</span>
          )}
        </span>
      </div>
      <p id={`${id}-help`} className="text-xs leading-5 text-ui-muted">
        清空影响整个会话，历史消息和文件保留；会话忙时顺延到下一次空闲执行。
      </p>
      {error && (
        <p id={`${id}-error`} className="text-xs text-ui-warning">
          {error}
        </p>
      )}
    </fieldset>
  )
}
