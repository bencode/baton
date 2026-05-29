import type { Session } from '@baton/shared'
import type { RefObject } from 'react'
import { StatusBadge } from '../../../components/status-badge'
import type { RenderItem } from '../event-render'
import { RenderItemView } from './render-item'

export type BadgeStatus = 'idle' | 'busy' | 'closed' | 'offline'

// `alive` / `busy` only come on view-merged responses; bare records (like the
// cached useSession one) don't carry them. closedAt is the only hard "no chat"
// signal.
export const deriveBadgeStatus = (
  session: Session & { alive?: boolean; busy?: boolean },
): BadgeStatus => {
  if (session.closedAt) return 'closed'
  if (session.alive === false) return 'offline'
  if (session.busy) return 'busy'
  return 'idle'
}

type HeaderProps = { session: Session; badgeStatus: BadgeStatus; streamStatus: string }
export const SessionHeader = ({ session, badgeStatus, streamStatus }: HeaderProps) => (
  <div className="flex shrink-0 flex-col gap-2 border-b border-gray-200 p-6">
    <div className="flex items-center gap-1.5 text-xs tracking-wider text-gray-500 uppercase">
      <span>Session</span>
      <span aria-hidden="true" className="text-gray-300">
        ·
      </span>
      <span className="font-mono normal-case tracking-normal text-gray-400">#{session.id}</span>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      <h2 className="text-lg font-semibold tracking-tight text-gray-900">{session.name}</h2>
      <StatusBadge status={badgeStatus} />
      <span className="text-xs text-gray-400">stream: {streamStatus}</span>
    </div>
    {session.worktreePath && (
      <p className="font-mono text-xs text-gray-500">cwd: {session.worktreePath}</p>
    )}
    {session.claudeSessionId && (
      <p className="font-mono text-xs text-gray-500">claude session: {session.claudeSessionId}</p>
    )}
  </div>
)

type EventStreamProps = { items: RenderItem[]; scrollRef: RefObject<HTMLDivElement | null> }
export const EventStream = ({ items, scrollRef }: EventStreamProps) => (
  <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-50 px-4 py-4">
    {items.length === 0 ? (
      <p className="text-sm text-gray-400">no events yet — say something below.</p>
    ) : (
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {items.map(item => (
          <RenderItemView key={item.key} item={item} />
        ))}
      </div>
    )}
  </div>
)

type ComposerProps = {
  draft: string
  setDraft: (v: string) => void
  sending: boolean
  disabled: boolean
  onSend: () => void
}
export const Composer = ({ draft, setDraft, sending, disabled, onSend }: ComposerProps) => (
  <div className="shrink-0 border-t border-gray-200 bg-white p-3">
    <div className="mx-auto flex max-w-3xl items-end gap-2">
      <textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            onSend()
          }
        }}
        disabled={disabled}
        placeholder={disabled ? 'session closed' : 'Message (⌘/Ctrl-Enter to send)'}
        className="min-h-[44px] flex-1 resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
        rows={2}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={disabled || sending || draft.trim().length === 0}
        className="rounded-md border border-blue-500 bg-blue-500 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-300"
      >
        Send
      </button>
    </div>
  </div>
)
