import { useState } from 'react'
import { Markdown } from '../../../../components/markdown'
import { Caret } from '../tool-block'

// Extended-thinking block — model's internal reasoning. Collapsed by default
// since it's typically long and supplementary to the actual answer. Click
// the header to read; the body renders as markdown so headings / lists /
// code show through. The opaque `signature` field is intentionally dropped
// upstream (in the reducer) so it can never accidentally leak.
// First non-empty line of the reasoning, clipped — gives the collapsed row
// enough scent to spot turning points ("now I see the problem…") at a glance.
export const thinkingPreview = (text: string, max = 60): string => {
  const line =
    text
      .split('\n')
      .find(l => l.trim() !== '')
      ?.trim() ?? ''
  return line.length > max ? `${line.slice(0, max)}…` : line
}

export const ThinkingBlock = ({ text, bare = false }: { text: string; bare?: boolean }) => {
  const [open, setOpen] = useState(false)
  const chrome = bare
    ? 'px-1 py-1'
    : 'rounded-md border border-gray-200 bg-white px-2 py-1.5 hover:bg-gray-50'
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 self-start text-left font-mono text-xs text-gray-500 italic ${chrome}`}
      >
        <span className="not-italic">
          <Caret open={open} />
        </span>
        <span>thinking</span>
        {!open && <span className="truncate text-gray-400">{thinkingPreview(text)}</span>}
      </button>
      {open && (
        <div className="ml-4 max-w-4xl rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-sm text-gray-600 italic">
          <Markdown text={text} />
        </div>
      )}
    </div>
  )
}
