import { useState } from 'react'

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const truncate = (s: string, max = 80): string => (s.length > max ? `${s.slice(0, max)}…` : s)

// Per-tool natural-language summary for the most common claude tools — the
// full JSON is still available in the expanded body. Unknown tools fall
// through to a generic first-field preview.
const smartSummary = (name: string, input: unknown): string => {
  if (!isRecord(input)) return typeof input === 'string' ? truncate(input) : ''
  const r = input
  if (name === 'Bash' && typeof r.command === 'string') return truncate(r.command, 120)
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

const SectionLabel = ({ children }: { children: string }) => (
  <div className="mt-1 text-[10px] tracking-wider text-gray-400 uppercase">{children}</div>
)

const ToolBlockBody = ({ input, resultText, isError }: Omit<ToolBlockProps, 'name'>) => (
  <div className="ml-4 flex flex-col gap-1">
    <SectionLabel>input</SectionLabel>
    <pre className="overflow-x-auto rounded border border-gray-100 bg-gray-50 p-2 font-mono text-xs whitespace-pre-wrap break-words text-gray-700">
      {JSON.stringify(input, null, 2)}
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

export const ToolBlock = ({ name, input, resultText, isError }: ToolBlockProps) => {
  const [open, setOpen] = useState(false)
  const summary = smartSummary(name, input)
  const lines = resultText !== undefined ? lineCount(resultText) : null
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 self-start rounded-md border border-gray-200 bg-white px-2 py-1.5 text-left font-mono text-xs text-gray-700 hover:bg-gray-50"
      >
        <span aria-hidden="true" className="text-gray-400">
          {open ? '▾' : '▸'}
        </span>
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
      {open && <ToolBlockBody input={input} resultText={resultText} isError={isError} />}
    </div>
  )
}
