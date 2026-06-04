import { useState } from 'react'
import { type ActivityGroup, groupSummary, type NodeTone, nodeTone } from './group-items'
import { ThinkingBlock } from './render-item'
import { Caret, ToolBlock } from './tool-block'

// Timeline node per step: amber = side-effectful tool, gray = read-only,
// red = failed, pulsing blue = running right now, hollow ring = thinking.
const NODE_STYLE: Record<NodeTone, string> = {
  running: 'h-2 w-2 rounded-full bg-blue-500 animate-breathe',
  error: 'h-2 w-2 rounded-full bg-red-500',
  write: 'h-2 w-2 rounded-full bg-amber-400',
  read: 'h-2 w-2 rounded-full bg-gray-300',
  thinking: 'h-1.5 w-1.5 rounded-full border border-gray-300 bg-white',
}

// A folded run of tool calls + thinking. Live groups (turn in flight) default
// open so you can watch the agent work; once the turn closes, `live` drops and
// the group collapses to its summary row — unless the user has toggled it,
// which then wins (choice is sticky for the group's lifetime). Expanded, the
// rows hang off a single vertical rule instead of carrying borders each: one
// continuous structure, with the node dot as the per-step status carrier.
export const ActivityGroupView = ({ group }: { group: ActivityGroup }) => {
  const [choice, setChoice] = useState<boolean | null>(null)
  const open = choice ?? group.live
  const { steps, parts, failed } = groupSummary(group)
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={() => setChoice(!open)}
        className="flex items-center gap-2 self-start rounded-md px-1 py-0.5 text-left font-mono text-xs text-gray-400 hover:text-gray-600"
      >
        <Caret open={open} />
        <span>
          {steps} step{steps === 1 ? '' : 's'}
        </span>
        {parts.length > 0 && <span className="text-gray-300">· {parts.join(' · ')}</span>}
        {failed > 0 && (
          <span className="flex items-center gap-1 text-red-600">
            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-red-500" />
            {failed} failed
          </span>
        )}
        {group.live && <span className="text-blue-500">running…</span>}
      </button>
      {open && (
        <div className="relative flex flex-col gap-0.5 pl-4">
          <div aria-hidden="true" className="absolute top-2 bottom-2 left-[3px] w-px bg-gray-100" />
          {group.items.map(item => (
            <div key={item.key} className="animate-rise relative">
              <span
                aria-hidden="true"
                className="absolute top-[7px] -left-4 flex h-2 w-2 items-center justify-center"
              >
                <span className={NODE_STYLE[nodeTone(item, group.live)]} />
              </span>
              {item.kind === 'tool-block' ? (
                <ToolBlock
                  name={item.name}
                  input={item.input}
                  resultText={item.resultText}
                  isError={item.isError}
                  bare
                />
              ) : (
                <ThinkingBlock text={item.text} bare />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
