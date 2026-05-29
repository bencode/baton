import type { Session } from '@baton/shared'
import type { RefObject } from 'react'
import { StatusBadge } from '../../../components/status-badge'
import type { RenderItem } from '../event-render'
import { RenderItemView } from './render-item'

// Session has no persistent state field (M2.9). Header badge only fires for
// the one transient signal worth a label: streaming. Worker-level offline /
// detached are diagnostic, not session states.
export type BadgeStatus = 'idle' | 'streaming'

export const deriveBadgeStatus = (session: Session & { busy?: boolean }): BadgeStatus =>
  session.busy ? 'streaming' : 'idle'

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
    <p className="font-mono text-xs text-gray-500">cwd: {session.worktreePath}</p>
    <p className="font-mono text-xs text-gray-500">
      {session.agentKind} session: {session.agentSessionId}
    </p>
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

// Pull image files out of a paste/clipboard synchronously (getAsFile must run
// inside the event), then convert to data URLs off the event loop.
const extractImageFiles = (items: DataTransferItemList): File[] =>
  Array.from(items)
    .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile())
    .filter((f): f is File => f !== null)

const fileToDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const ThumbStrip = ({ images, onRemove }: { images: string[]; onRemove: (i: number) => void }) => (
  <div className="mx-auto mb-2 flex max-w-3xl flex-wrap gap-2">
    {images.map((src, i) => (
      <div key={src.slice(0, 64)} className="relative">
        {/* biome-ignore lint/a11y/useAltText: pasted screenshot preview */}
        <img src={src} className="h-16 w-16 rounded border border-gray-200 object-cover" />
        <button
          type="button"
          onClick={() => onRemove(i)}
          className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] leading-none text-gray-500 shadow-sm hover:text-gray-800"
        >
          ×
        </button>
      </div>
    ))}
  </div>
)

type ComposerProps = {
  draft: string
  setDraft: (v: string) => void
  images: string[]
  setImages: (v: string[]) => void
  sending: boolean
  disabled: boolean
  onSend: () => void
}

// Keyboard-only send (⌘/Ctrl-Enter). No Send button — Cmd-Enter is already
// the natural Claude Code / chat convention. The `sending` flag is held in
// state so a second Cmd-Enter while the first request is in-flight is
// silently dropped (no UI lock; placeholder gains a tiny `sending…` hint).
export const Composer = ({
  draft,
  setDraft,
  images,
  setImages,
  sending,
  disabled,
  onSend,
}: ComposerProps) => {
  const placeholder = disabled
    ? 'session closed'
    : sending
      ? '⌘/Ctrl-Enter to send · sending…'
      : '⌘/Ctrl-Enter to send · paste to attach images'
  return (
    <div className="shrink-0 border-t border-gray-200 bg-white p-3">
      {images.length > 0 && (
        <ThumbStrip images={images} onRemove={i => setImages(images.filter((_, j) => j !== i))} />
      )}
      <div className="mx-auto max-w-3xl">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onPaste={e => {
            const files = extractImageFiles(e.clipboardData.items)
            if (files.length === 0) return
            e.preventDefault()
            void Promise.all(files.map(fileToDataUrl)).then(urls => setImages([...images, ...urls]))
          }}
          onKeyDown={e => {
            if (sending) return
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              onSend()
            }
          }}
          disabled={disabled}
          placeholder={placeholder}
          className="min-h-[44px] w-full resize-y rounded-md border border-gray-200 bg-white px-2 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
          rows={2}
        />
      </div>
    </div>
  )
}
