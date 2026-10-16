import { useId, useState } from 'react'
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
  const id = useId()
  return (
    <div className={bare ? 'chat-tool' : 'chat-tool chat-tool-standalone'}>
      <button
        type="button"
        className="chat-tool-summary ui-focus"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={id}
      >
        <Caret open={open} />
        <span className="chat-process-label">思考记录</span>
        {!open && <span className="chat-tool-preview">{thinkingPreview(text)}</span>}
      </button>
      <div id={id} hidden={!open}>
        {open && (
          <div className="chat-thinking-text">
            <Markdown text={text} variant="process" />
          </div>
        )}
      </div>
    </div>
  )
}
