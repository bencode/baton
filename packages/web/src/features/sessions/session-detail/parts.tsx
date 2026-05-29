import type { Session } from '@baton/shared'
import { type RefObject, useState } from 'react'
import type { RenderItem } from '../event-render'
import { RenderItemView } from './render-item'

// SessionHeader — one-line identity strip, gritty enough that the rest of the
// surface stays a quiet reading area. Diagnostic info (cwd, full agent UUID)
// is folded behind a single ⓘ toggle so they don't dominate every refresh.
//
// Session has no persistent state field (M2.9). No chip, no badge — we did
// it for a reason. The dot color reads stream liveness off `streamStatus`
// without needing extra props.
type HeaderProps = { session: Session; streamStatus: string }

const truncateUuid = (id: string): string => {
  if (id.length <= 12) return id
  return `${id.slice(0, 8)}…${id.slice(-4)}`
}

const CopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)
  const onCopy = () => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={onCopy}
      className="text-gray-400 transition-colors hover:text-gray-700"
      aria-label={copied ? 'copied' : 'copy'}
    >
      {copied ? '✓' : '⌘'}
    </button>
  )
}

export const SessionHeader = ({ session, streamStatus }: HeaderProps) => {
  const [open, setOpen] = useState(false)
  // Stream liveness color: emerald=live, amber=connecting, red=error, else gray.
  const streamDot =
    streamStatus === 'open'
      ? 'bg-emerald-500'
      : streamStatus === 'connecting'
        ? 'bg-amber-400'
        : streamStatus === 'error'
          ? 'bg-red-500'
          : 'bg-gray-300'
  return (
    <div className="shrink-0 border-b border-gray-200 bg-white px-6 py-3">
      <div className="flex items-center gap-3 text-sm">
        <span className="font-semibold tracking-tight text-gray-900">{session.name}</span>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <span className="font-mono text-xs text-gray-500">{session.agentKind}</span>
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <span className="font-mono text-xs text-gray-500">
          {truncateUuid(session.agentSessionId)}
        </span>
        <CopyButton text={session.agentSessionId} />
        <span aria-hidden className="text-gray-300">
          ·
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <span className={`h-1.5 w-1.5 rounded-full ${streamDot}`} />
          stream {streamStatus}
        </span>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="ml-auto text-xs text-gray-400 transition-colors hover:text-gray-700"
          aria-label={open ? 'hide details' : 'show details'}
        >
          {open ? '▾' : 'ⓘ'}
        </button>
      </div>
      {open && (
        <div className="mt-2 flex flex-col gap-0.5 font-mono text-xs text-gray-500">
          <span>cwd: {session.worktreePath}</span>
          <span>agent session: {session.agentSessionId}</span>
        </div>
      )}
    </div>
  )
}

type EventStreamProps = { items: RenderItem[]; scrollRef: RefObject<HTMLDivElement | null> }
export const EventStream = ({ items, scrollRef }: EventStreamProps) => (
  <div ref={scrollRef} className="flex-1 overflow-auto bg-white px-6 py-4">
    {items.length === 0 ? (
      <p className="text-sm text-gray-400">no events yet — say something below.</p>
    ) : (
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
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
  <div className="mx-auto mb-2 flex max-w-5xl flex-wrap gap-2">
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
      <div className="mx-auto max-w-5xl">
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
