import type { QueuedMessage } from '../event-render'

// Messages sent while a turn is running queue on the worker until their own turn
// starts. We show them here — muted, below the transcript — instead of inlining
// them, so their pending state reads honestly. Each moves into the transcript
// the instant its turn_start arrives (state is derived from the event stream).
export const QueuedMessages = ({ queued }: { queued: QueuedMessage[] }) => {
  if (queued.length === 0) return null
  return (
    <div className="shrink-0 border-t border-gray-100 px-3 py-2">
      <div className="mb-1 font-mono text-[11px] tracking-wide text-gray-400 select-none uppercase">
        queued · {queued.length}
      </div>
      <div className="flex flex-col gap-1">
        {queued.map(m => (
          <div
            key={m.key}
            className="rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-1.5"
          >
            <span className="mr-2 font-mono text-xs text-gray-400 select-none">you›</span>
            <span className="text-sm whitespace-pre-wrap text-gray-500">{m.text}</span>
            {m.attachments && m.attachments.length > 0 && (
              <span className="ml-2 text-xs text-gray-400">+{m.attachments.length} file(s)</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
