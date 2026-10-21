import { useId } from 'react'
import { SelectControl } from '../../components/select-control'
import { type IntervalUnit, intervalError, toSeconds } from './format'

export type ContextClearDraft = { enabled: boolean; value: string; unit: IntervalUnit }

export const contextClearDraft = (seconds?: number): ContextClearDraft => {
  const duration = seconds ?? 7_200
  const unit =
    (['day', 'hour', 'min', 'sec'] as const).find(
      candidate => duration % toSeconds(1, candidate) === 0,
    ) ?? 'sec'
  const divisor = toSeconds(1, unit)
  return { enabled: seconds !== undefined, value: String(duration / divisor), unit }
}

export const contextClearSeconds = (draft: ContextClearDraft): number | null =>
  draft.enabled ? toSeconds(Number(draft.value), draft.unit) : null

export const contextClearError = (draft: ContextClearDraft): string | null => {
  if (!draft.enabled) return null
  if (!draft.value.trim() || !Number.isInteger(Number(draft.value))) return '请输入整数周期。'
  const error = intervalError(toSeconds(Number(draft.value), draft.unit))
  if (error === 'max 90d') return '清理周期不能超过 90 天。'
  return error ? '清理周期至少为 30 秒。' : null
}

type ContextClearInputProps = {
  value: ContextClearDraft
  onChange(value: ContextClearDraft): void
  disabled?: boolean
}

export const ContextClearInput = ({ value, onChange, disabled }: ContextClearInputProps) => {
  const id = useId()
  const error = contextClearError(value)
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-2">
      <label className="flex items-center gap-2 text-xs font-medium text-ui-text">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={event => onChange({ ...value, enabled: event.target.checked })}
          className="accent-ui-accent"
        />
        自动清理上下文
      </label>
      {value.enabled && (
        <div className="flex min-w-0 max-w-64">
          <input
            type="number"
            min={1}
            step={1}
            required
            aria-label="清理周期数值"
            aria-invalid={error !== null}
            aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
            value={value.value}
            onChange={event => onChange({ ...value, value: event.target.value })}
            className="ui-input min-w-0 w-0 flex-1 rounded-r-none border-r-0"
          />
          <SelectControl
            aria-label="清理周期单位"
            value={value.unit}
            onChange={event => onChange({ ...value, unit: event.target.value as IntervalUnit })}
            className="w-28 shrink-0 rounded-l-none"
          >
            <option value="sec">秒</option>
            <option value="min">分钟</option>
            <option value="hour">小时</option>
            <option value="day">天</option>
          </SelectControl>
        </div>
      )}
      {value.enabled && (
        <p id={`${id}-help`} className="text-xs leading-5 text-ui-muted">
          按此任务的周期，在定时触发且会话空闲时清理。影响整个会话，历史消息和文件保留。
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-xs text-ui-warning">
          {error}
        </p>
      )}
    </fieldset>
  )
}
