import type { Id, PendingInput } from '@baton/shared'
import { TrashIcon } from '../../../components/icons'

// PendingInput is independent of the transcript and can be removed until claim.
type QueuedMessagesProps = {
  queued: PendingInput[]
  cancelling: ReadonlySet<Id>
  error: string | null
  onCancel: (inputId: Id) => void
}

export const QueuedMessages = ({ queued, cancelling, error, onCancel }: QueuedMessagesProps) => {
  if (queued.length === 0 && !error) return null
  return (
    <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-2">
      <div className="mx-auto max-w-5xl">
        <div className="mb-1 font-mono text-[11px] tracking-wide text-gray-500 select-none uppercase">
          queued · {queued.length}
        </div>
        <div className="flex flex-col gap-1">
          {queued.map(m => (
            <div
              key={m.id}
              className="group flex items-start gap-2 rounded-md border border-dashed border-gray-200 bg-gray-50 px-3 py-1.5"
            >
              <div className="min-w-0 flex-1">
                <span className="mr-2 font-mono text-xs text-gray-400 select-none">you›</span>
                <span className="text-sm whitespace-pre-wrap break-words text-gray-600">
                  {m.text}
                </span>
                {m.attachments.length + m.images.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    +{m.attachments.length + m.images.length} file(s)
                  </span>
                )}
              </div>
              <button
                type="button"
                aria-label="delete queued message"
                title="delete queued message"
                disabled={cancelling.has(m.id)}
                onClick={() => onCancel(m.id)}
                className="rounded p-1 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 disabled:opacity-40"
              >
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
