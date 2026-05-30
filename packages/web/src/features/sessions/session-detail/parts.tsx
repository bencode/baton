import type { Attachment, Session } from '@baton/shared'
import { type RefObject, useRef, useState } from 'react'
import { attachmentSrc } from '../../../api'
import type { RenderItem } from '../event-render'
import { FileChip, isImage } from './attachment-view'
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
          {session.agentSessionId ? truncateUuid(session.agentSessionId) : 'materializing…'}
        </span>
        <CopyButton text={session.agentSessionId ?? ''} />
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
          <span>cwd: {session.worktreePath ?? '(pending materialize)'}</span>
          <span>agent session: {session.agentSessionId ?? '(pending materialize)'}</span>
        </div>
      )}
    </div>
  )
}

// Surfaces connectivity problems the user would otherwise only see in daemon
// logs. Worker issues block message processing (shown first); a browser stream
// error is display-only (EventSource auto-retries). `attached` is treated as a
// transient warning here, not a session-state chip — a brief daemon SSE blip
// keeps heartbeating, so this only fires on a sustained drop.
type ConnectionBannerProps = { streamStatus: string; alive: boolean; attached: boolean }
export const ConnectionBanner = ({ streamStatus, alive, attached }: ConnectionBannerProps) => {
  const msg = !alive
    ? 'Worker 离线 — 消息会在它重新上线后才被处理'
    : !attached
      ? '会话未连接到 Worker — 发送的消息暂时不会被处理'
      : streamStatus === 'error'
        ? '实时连接中断，正在重连… 期间的新消息可能不会即时显示'
        : null
  if (!msg) return null
  return (
    <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-1.5 text-xs text-amber-800">
      ⚠ {msg}
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
// inside the event).
const extractImageFiles = (items: DataTransferItemList): File[] =>
  Array.from(items)
    .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile())
    .filter((f): f is File => f !== null)

// Paperclip — inline SVG per the codebase convention (stroke=currentColor).
const PaperclipIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M13 6.5l-5.6 5.6a2.5 2.5 0 0 1-3.5-3.5l5.9-5.9a1.5 1.5 0 0 1 2.1 2.1l-5.9 5.9a.5.5 0 0 1-.7-.7l5.4-5.4" />
  </svg>
)

// Up-arrow send glyph — inline SVG per the codebase convention.
const SendIcon = () => (
  <svg
    viewBox="0 0 16 16"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M8 13V3M4 7l4-4 4 4" />
  </svg>
)

// Indeterminate spinner shown on the send button while an upload/send is in flight.
const Spinner = () => (
  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
)

const RemoveButton = ({ onRemove }: { onRemove: () => void }) => (
  <button
    type="button"
    onClick={onRemove}
    aria-label="remove attachment"
    className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-gray-300 bg-white text-[10px] leading-none text-gray-500 shadow-sm hover:text-gray-800"
  >
    ×
  </button>
)

// Pending attachments inside the input card, above the textarea: image previews
// as thumbnails, other files as labelled chips. Each removable before send.
const AttachmentStrip = ({
  attachments,
  onRemove,
}: {
  attachments: Attachment[]
  onRemove: (id: string) => void
}) => (
  <div className="mb-2 flex flex-wrap gap-2">
    {attachments.map(att => (
      <div key={att.id} className="relative">
        {isImage(att) ? (
          // biome-ignore lint/a11y/useAltText: uploaded screenshot preview
          <img
            src={attachmentSrc(att)}
            className="h-16 w-16 rounded border border-gray-200 object-cover"
          />
        ) : (
          <FileChip att={att} />
        )}
        <RemoveButton onRemove={() => onRemove(att.id)} />
      </div>
    ))}
  </div>
)

type ComposerProps = {
  draft: string
  setDraft: (v: string) => void
  attachments: Attachment[]
  onAddFiles: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  uploading: boolean
  uploadError: string | null
  sending: boolean
  onSend: () => void
}

// One rounded input card: pending attachments + textarea stacked over a bottom
// toolbar (📎 left, circular send button right). Attachments arrive three ways —
// the 📎 picker, drag-drop, and paste — all funnelling through onAddFiles, which
// uploads immediately; the whole card is the drop zone. Send is available via the
// button and ⌘/Ctrl-Enter, both gated on `canSend` (idle + has text/attachment).
export const Composer = ({
  draft,
  setDraft,
  attachments,
  onAddFiles,
  onRemoveAttachment,
  uploading,
  uploadError,
  sending,
  onSend,
}: ComposerProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const busy = sending || uploading
  const canSend = !busy && (draft.trim().length > 0 || attachments.length > 0)
  return (
    <div className="shrink-0 border-t border-gray-200 bg-white p-3">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drop zone is the whole card */}
      <div
        onDragOver={e => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          onAddFiles(Array.from(e.dataTransfer.files))
        }}
        className={`mx-auto max-w-5xl rounded-xl border bg-white px-3 py-2 transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${dragging ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'}`}
      >
        {attachments.length > 0 && (
          <AttachmentStrip attachments={attachments} onRemove={onRemoveAttachment} />
        )}
        {uploadError && <p className="mb-2 text-xs text-red-600">{uploadError}</p>}
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onPaste={e => {
            const files = extractImageFiles(e.clipboardData.items)
            if (files.length === 0) return
            e.preventDefault()
            onAddFiles(files)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (canSend) onSend()
            }
          }}
          placeholder="message… (⌘/Ctrl-Enter to send · 📎/drag/paste to attach)"
          className="w-full resize-none border-0 bg-transparent px-1 text-sm text-gray-800 focus:outline-none focus:ring-0"
          rows={2}
        />
        <div className="mt-1.5 flex items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="attach files"
            className="text-gray-400 transition-colors hover:text-gray-700"
          >
            <PaperclipIcon />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              onAddFiles(Array.from(e.target.files ?? []))
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={onSend}
            disabled={!canSend}
            aria-label={busy ? 'sending' : 'send message'}
            className="ml-auto flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400"
          >
            {busy ? <Spinner /> : <SendIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}
