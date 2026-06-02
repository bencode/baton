import type { Attachment } from '@baton/shared'
import { useRef, useState } from 'react'
import { attachmentSrc } from '../../../api'
import { FileChip, isImage } from './attachment-view'
import { CommandMenu } from './command-menu'
import type { SlashCommand } from './commands'
import { PaperclipIcon, SendIcon, Spinner } from './icons'
import { useSlashCommands } from './use-slash-commands'

// Pull image files out of a paste/clipboard synchronously (getAsFile must run
// inside the event).
const extractImageFiles = (items: DataTransferItemList): File[] =>
  Array.from(items)
    .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile())
    .filter((f): f is File => f !== null)

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
  active: boolean
  sendError: string | null
  onSend: () => void
  // Run a slash command (/clear, /help, /plan …) instead of sending a message.
  onCommand: (command: SlashCommand, args: string) => void
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
  active,
  sendError,
  onSend,
  onCommand,
}: ComposerProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const slash = useSlashCommands(draft, setDraft, onCommand)
  const busy = sending || uploading
  const canSend = active && !busy && (draft.trim().length > 0 || attachments.length > 0)
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
        className={`mx-auto max-w-5xl rounded-xl border px-3 py-2 transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${dragging ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'} ${active ? 'bg-white' : 'bg-gray-50'}`}
      >
        {attachments.length > 0 && (
          <AttachmentStrip attachments={attachments} onRemove={onRemoveAttachment} />
        )}
        {uploadError && <p className="mb-2 text-xs text-red-600">{uploadError}</p>}
        {sendError && <p className="mb-2 text-xs text-red-600">{sendError}</p>}
        {slash.open && (
          <CommandMenu commands={slash.menu} activeIndex={slash.activeIndex} onPick={slash.pick} />
        )}
        <textarea
          value={draft}
          onChange={e => {
            setDraft(e.target.value)
            slash.reset()
          }}
          onPaste={e => {
            const files = extractImageFiles(e.clipboardData.items)
            if (files.length === 0) return
            e.preventDefault()
            onAddFiles(files)
          }}
          onKeyDown={e => {
            if (slash.onKeyDown(e)) return
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              if (canSend) onSend()
            }
          }}
          disabled={!active}
          placeholder={
            active
              ? 'message… (⌘/Ctrl-Enter to send · 📎/drag/paste to attach)'
              : 'session inactive — resume to send'
          }
          className="w-full resize-none border-0 bg-transparent px-1 text-sm text-gray-800 focus:outline-none focus:ring-0 disabled:cursor-not-allowed"
          rows={2}
        />
        <div className="mt-1.5 flex items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!active}
            aria-label="attach files"
            className="text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-40"
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
