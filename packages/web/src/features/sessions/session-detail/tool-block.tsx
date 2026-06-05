import { useState } from 'react'

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

const lineCount = (s: string): number => (s.match(/\n/g)?.length ?? 0) + 1

type ToolBlockProps = {
  name: string
  input: unknown
  resultText?: string
  isError?: boolean
}

// Rotating caret shared by the collapsible rows — one glyph, transform only.
export const Caret = ({ open }: { open: boolean }) => (
  <span
    aria-hidden="true"
    className={`text-gray-400 transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
  >
    ▸
  </span>
)

const SectionLabel = ({ children }: { children: string }) => (
  <div className="mt-1 text-[10px] tracking-wider text-gray-400 uppercase">{children}</div>
)

// Value-first input rendering: a Bash invocation reads better as the command
// itself than as `{ "command": "…" }`. Other tools keep the JSON (an Edit's
// old/new strings genuinely need the structure).
const inputText = (name: string, input: unknown): string =>
  name === 'Bash' && isRecord(input) && typeof input.command === 'string'
    ? input.command
    : JSON.stringify(input, null, 2)

const ToolBlockBody = ({ name, input, resultText, isError }: ToolBlockProps) => (
  <div className="ml-4 flex min-w-0 flex-col gap-1">
    <SectionLabel>input</SectionLabel>
    <pre className="overflow-x-auto rounded border border-gray-100 bg-gray-50 p-2 font-mono text-xs whitespace-pre-wrap break-words text-gray-700">
      {inputText(name, input)}
    </pre>
    {resultText !== undefined && (
      <>
        <SectionLabel>{isError ? 'error' : 'result'}</SectionLabel>
        <pre
          className={`overflow-x-auto rounded border p-2 font-mono text-xs whitespace-pre-wrap break-words ${
            isError
              ? 'border-red-200 bg-red-50/50 text-red-800'
              : 'border-gray-100 bg-white text-gray-700'
          }`}
        >
          {resultText}
        </pre>
      </>
    )}
  </div>
)

// `bare` drops the per-row button chrome — inside an activity-group timeline
// the vertical rule + node already provide the structure, so a border per row
// would only re-fragment the group.
export const ToolBlock = ({
  name,
  input,
  resultText,
  isError,
  bare = false,
}: ToolBlockProps & { bare?: boolean }) => {
  const [open, setOpen] = useState(false)
  const summary = smartSummary(name, input)
  const lines = resultText !== undefined ? lineCount(resultText) : null
  const chrome = bare
    ? 'px-1 py-1 text-gray-600 hover:text-gray-900'
    : 'rounded-md border border-gray-200 bg-white px-2 py-1.5 text-gray-700 hover:bg-gray-50'
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 self-start text-left font-mono text-xs ${chrome}`}
      >
        <Caret open={open} />
        <span className="font-semibold text-gray-800">{name}</span>
        {summary && <span className="truncate text-gray-500">{summary}</span>}
        {lines !== null && (
          <span className="text-[10px] text-gray-400">
            {lines} line{lines === 1 ? '' : 's'}
          </span>
        )}
        {isError && (
          <span className="rounded bg-red-50 px-1 text-[10px] text-red-700 ring-1 ring-inset ring-red-200/60">
            error
          </span>
        )}
      </button>
      {open && (
        <ToolBlockBody name={name} input={input} resultText={resultText} isError={isError} />
      )}
    </div>
  )
}
