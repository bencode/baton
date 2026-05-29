import { useState } from 'react'

const inputSummary = (input: unknown): string => {
  if (input == null) return ''
  if (typeof input === 'string') return input.length > 80 ? `${input.slice(0, 80)}…` : input
  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>)
    if (entries.length === 0) return ''
    const [k, v] = entries[0] as [string, unknown]
    const vs = typeof v === 'string' ? v : JSON.stringify(v)
    const head = `${k}: ${vs}`
    return head.length > 80 ? `${head.slice(0, 80)}…` : head
  }
  return String(input)
}

type ToolBlockProps = {
  name: string
  input: unknown
  resultText?: string
  isError?: boolean
}

const ToolBlockBody = ({ input, resultText, isError }: Omit<ToolBlockProps, 'name'>) => (
  <div className="ml-4 flex flex-col gap-1">
    <pre className="overflow-x-auto rounded border border-gray-100 bg-gray-50 p-2 font-mono text-xs whitespace-pre-wrap break-words text-gray-700">
      {JSON.stringify(input, null, 2)}
    </pre>
    {resultText !== undefined && (
      <pre
        className={`overflow-x-auto rounded border p-2 font-mono text-xs whitespace-pre-wrap break-words ${
          isError
            ? 'border-red-200 bg-red-50/50 text-red-800'
            : 'border-gray-100 bg-white text-gray-700'
        }`}
      >
        {resultText}
      </pre>
    )}
  </div>
)

export const ToolBlock = ({ name, input, resultText, isError }: ToolBlockProps) => {
  const [open, setOpen] = useState(false)
  const summary = inputSummary(input)
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
