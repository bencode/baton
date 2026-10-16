import type { ItemStatus } from '@baton/shared'
import { useId, useState } from 'react'
import { ChevronDownIcon } from '../../../components/icons'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const truncate = (s: string, max = 80): string => (s.length > max ? `${s.slice(0, max)}…` : s)

// Leading KEY=VALUE assignments carry no scent (the same channel id repeats on
// every call) — strip them so the actual verb leads the summary.
export const stripEnvAssignments = (cmd: string): string => cmd.replace(/^(?:\s*\w+=\S+\s+)+/, '')

// Same-prefix commands (one CLI, many payloads) differ at the tail, so keep
// both ends and elide the middle instead of chopping the differentiating part.
export const truncateMiddle = (s: string, max = 120): string =>
  s.length > max ? `${s.slice(0, Math.ceil(max * 0.6))} … ${s.slice(-Math.floor(max * 0.3))}` : s

// Per-tool natural-language summary for the most common claude tools — the
// full JSON is still available in the expanded body. Unknown tools fall
// through to a generic first-field preview.
const smartSummary = (name: string, input: unknown): string => {
  if (!isRecord(input)) return typeof input === 'string' ? truncate(input) : ''
  const r = input
  if (name === 'Bash' && typeof r.command === 'string')
    return truncateMiddle(stripEnvAssignments(r.command), 120)
  if (name === 'Read' && typeof r.file_path === 'string') return r.file_path
  if (name === 'Write' && typeof r.file_path === 'string') return r.file_path
  if (name === 'Edit' && typeof r.file_path === 'string') return r.file_path
  if (name === 'Grep' && typeof r.pattern === 'string') {
    return typeof r.path === 'string' ? `${r.pattern} · ${r.path}` : String(r.pattern)
  }
  if (name === 'Glob' && typeof r.pattern === 'string') return r.pattern
  // Generic: first entry as `key: value`.
  const entries = Object.entries(r)
  if (entries.length === 0) return ''
  const [k, v] = entries[0] as [string, unknown]
  const vs = typeof v === 'string' ? v : JSON.stringify(v)
  return truncate(`${k}: ${vs}`)
}

type ToolBlockProps = {
  name: string
  input: unknown
  resultText?: string
  isError?: boolean
  status?: ItemStatus
  live?: boolean
  statusKnown?: boolean
  bare?: boolean
}

export const Caret = ({ open }: { open: boolean }) => (
  <span aria-hidden="true" className="chat-caret" data-open={open}>
    <ChevronDownIcon />
  </span>
)

const inputText = (name: string, input: unknown): string =>
  name === 'Bash' && isRecord(input) && typeof input.command === 'string'
    ? input.command
    : (JSON.stringify(input, null, 2) ?? String(input))

const ToolBlockBody = ({
  name,
  input,
  resultText,
  isError,
  status,
  live,
  statusKnown,
}: ToolBlockProps) => (
  <div className="chat-tool-payload">
    <div className="chat-payload-label">输入</div>
    {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll raw tool input. */}
    <pre tabIndex={0}>{inputText(name, input)}</pre>
    <div className="chat-payload-label chat-payload-result">
      {isError || status === 'failed' ? '错误结果' : '结果'}
    </div>
    {resultText !== undefined ? (
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll raw tool results.
      <pre tabIndex={0}>{resultText === '' ? '（空输出）' : resultText}</pre>
    ) : (
      <p className="chat-missing-result">
        {live && statusKnown && status === 'in_progress' ? '暂未收到结果' : '未提供结果'}
      </p>
    )}
  </div>
)

export const ToolBlock = ({
  name,
  input,
  resultText,
  isError,
  status,
  live = false,
  statusKnown = true,
  bare = false,
}: ToolBlockProps) => {
  const [choice, setChoice] = useState<boolean | null>(null)
  const id = useId()
  const failed = isError || status === 'failed'
  const open = choice ?? (live && status === 'in_progress' && !failed)
  const summary = smartSummary(name, input)
  return (
    <div className={bare ? 'chat-tool' : 'chat-tool chat-tool-standalone'}>
      <button
        type="button"
        className="chat-tool-summary ui-focus"
        onClick={() => setChoice(!open)}
        aria-expanded={open}
        aria-controls={id}
      >
        <Caret open={open} />
        <span className="chat-tool-name">{name}</span>
        {summary && <span className="chat-tool-preview">{summary}</span>}
        {failed ? (
          <span className="chat-status-error">失败</span>
        ) : live && status === 'in_progress' ? (
          <span className={statusKnown ? 'chat-status-running' : 'chat-status-muted'}>
            {statusKnown ? '执行中' : '状态待同步'}
          </span>
        ) : null}
      </button>
      <div id={id} hidden={!open}>
        {open && (
          <ToolBlockBody
            name={name}
            input={input}
            resultText={resultText}
            isError={isError}
            status={status}
            live={live}
            statusKnown={statusKnown}
          />
        )}
      </div>
    </div>
  )
}
