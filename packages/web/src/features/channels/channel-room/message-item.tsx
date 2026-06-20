import {
  type Attachment,
  type ChannelMessage,
  isImageAttachment,
  isMessageFor,
} from '@baton/shared'
import { FileChip } from '../../../components/attachments/attachment-view'
import { Markdown } from '../../../components/markdown'

const hhmm = (ts: number): string =>
  new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

// One message bubble. Mine align right (blue tint); a message directed at me (its
// `to` names me, and it isn't a broadcast) gets an amber ring. Body is Markdown —
// the same renderer as sessions — with attachments below (images inline, files as
// download chips). `attachmentUrl` carries the capability token in the query so
// the browser can fetch them (no cookie on the channel domain).
export const MessageItem = ({
  msg,
  me,
  attachmentUrl,
}: {
  msg: ChannelMessage
  me: string
  attachmentUrl: (att: Attachment) => string
}) => {
  const mine = msg.from === me
  const directed = msg.to !== undefined && msg.to.length > 0
  const atMe = !mine && directed && isMessageFor(msg, me)
  const tint = mine
    ? 'bg-blue-50 ring-1 ring-blue-100'
    : atMe
      ? 'bg-amber-50 ring-1 ring-amber-200'
      : 'bg-gray-100'
  const atts = msg.attachments ?? []
  return (
    <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      <div className="flex items-baseline gap-2 px-2 text-xs text-gray-400">
        <span
          className={`font-semibold ${msg.senderKind === 'agent' ? 'text-violet-600' : 'text-gray-600'}`}
        >
          {msg.from}
        </span>
        {directed && <span>→ {(msg.to ?? []).join(', ')}</span>}
        <span>{hhmm(msg.ts)}</span>
      </div>
      <div className={`max-w-full rounded-2xl px-3 py-1.5 text-sm ${tint}`}>
        {msg.text && <Markdown text={msg.text} />}
        {atts.length > 0 && (
          <div className={`flex flex-wrap gap-2 ${msg.text ? 'mt-2' : ''}`}>
            {atts.map(att =>
              isImageAttachment(att) ? (
                <a key={att.id} href={attachmentUrl(att)} target="_blank" rel="noreferrer">
                  <img
                    src={attachmentUrl(att)}
                    alt={att.filename}
                    className="max-h-60 max-w-full rounded border border-gray-200"
                  />
                </a>
              ) : (
                <FileChip key={att.id} att={att} download src={attachmentUrl} />
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
