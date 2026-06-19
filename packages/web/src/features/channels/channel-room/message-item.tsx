import { type ChannelMessage, isMessageFor } from '@baton/shared'
import { Markdown } from '../../../components/markdown'

const hhmm = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// One message bubble. Mine align right (blue tint); a message directed at me (its
// `to` names me, and it isn't a broadcast) gets an amber ring. Body is Markdown —
// the same renderer as sessions, so code / GFM / KaTeX formulas all work.
export const MessageItem = ({ msg, me }: { msg: ChannelMessage; me: string }) => {
  const mine = msg.from === me
  const directed = msg.to !== undefined && msg.to.length > 0
  const atMe = !mine && directed && isMessageFor(msg, me)
  const tint = mine
    ? 'bg-blue-50 ring-1 ring-blue-100'
    : atMe
      ? 'bg-amber-50 ring-1 ring-amber-200'
      : 'bg-gray-100'
  return (
    <div className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
      <div className="flex items-baseline gap-2 px-1 text-xs text-gray-400">
        <span
          className={`font-medium ${msg.senderKind === 'agent' ? 'text-violet-600' : 'text-gray-600'}`}
        >
          {msg.from}
        </span>
        {directed && <span>→ {(msg.to ?? []).join(', ')}</span>}
        <span>{hhmm(msg.ts)}</span>
      </div>
      <div className={`max-w-full rounded-2xl px-3 py-1.5 text-sm ${tint}`}>
        <Markdown text={msg.text} />
      </div>
    </div>
  )
}
