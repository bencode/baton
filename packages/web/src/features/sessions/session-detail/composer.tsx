import type { Attachment } from '@baton/shared'
import { useRef, useState } from 'react'
import { AttachmentStrip } from './attachment-strip'
import { CommandMenu } from './command-menu'
import type { SlashCommand } from './commands'
import { PaperclipIcon, SendIcon, Spinner } from './icons'
import { useAutosize } from './use-autosize'
import { useSlashCommands } from './use-slash-commands'

// Pull image files out of a paste/clipboard synchronously (getAsFile must run
// inside the event).
const extractImageFiles = (items: DataTransferItemList): File[] =>
  Array.from(items)
    .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
    .map(it => it.getAsFile())
    .filter((f): f is File => f !== null)

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
  // Session-wide read-only plan mode + its toggle (/plan command, Shift+Tab).
  planMode: boolean
  onTogglePlanMode: () => void
}

// One rounded input card: pending attachments + textarea stacked over a bottom
// toolbar (📎 left, circular send button right). Attachments arrive three ways —
// the 📎 picker, drag-drop, and paste — all funnelling through onAddFiles, which
// uploads immediately; the whole card is the drop zone. Send is available via the
// button and Enter (Shift+Enter = newline), both gated on `canSend` (idle + has
// text/attachment).
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
  planMode,
  onTogglePlanMode,
}: ComposerProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const [dragging, setDragging] = useState(false)
  const slash = useSlashCommands(draft, setDraft, onCommand, onTogglePlanMode)
  useAutosize(textareaRef, draft)
  const busy = sending || uploading
  const canSend = active && !busy && (draft.trim().length > 0 || attachments.length > 0)
  // Insert a {label} reference token at the caret so the user can cite a pending
  // attachment in their text.
  const insertLabel = (label: string) => {
    const token = `{${label}} `
    const el = textareaRef.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    setDraft(draft.slice(0, start) + token + draft.slice(end))
    requestAnimationFrame(() => {
      const pos = start + token.length
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }
  return (
    <div className="shrink-0 border-t border-gray-200 bg-white p-2 sm:p-3">
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
        className={`mx-auto min-w-0 max-w-5xl rounded-xl border px-3 py-2 transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${dragging ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'} ${active ? 'bg-white' : 'bg-gray-50'}`}
      >
        {planMode && (
          <button
            type="button"
            onClick={onTogglePlanMode}
            className="mb-2 flex w-full items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-left text-xs font-medium text-amber-700 ring-1 ring-amber-200 transition-colors hover:bg-amber-100"
          >
            📋 PLAN MODE · 只读规划，不改文件
            <span className="ml-auto text-amber-500">Shift+Tab 退出</span>
          </button>
        )}
        {attachments.length > 0 && (
          <AttachmentStrip
            attachments={attachments}
            onRemove={onRemoveAttachment}
            onInsertLabel={insertLabel}
          />
        )}
        {uploadError && <p className="mb-2 text-xs text-red-600">{uploadError}</p>}
        {sendError && <p className="mb-2 text-xs text-red-600">{sendError}</p>}
        {slash.open && (
          <CommandMenu commands={slash.menu} activeIndex={slash.activeIndex} onPick={slash.pick} />
        )}
        <textarea
          ref={textareaRef}
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
            // Enter sends; Shift+Enter is a newline (standard chat). ⌘/Ctrl-Enter
            // also sends (no shift), so existing muscle memory still works.
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              if (canSend) onSend()
            }
          }}
          disabled={!active}
          placeholder={
            active ? '发消息…  Enter 发送 · Shift+Enter 换行' : 'session inactive — resume to send'
          }
          // text-base on phones keeps iOS Safari from auto-zooming on focus (it
          // zooms any input < 16px); sm: restores the desktop 14px density.
          className="max-h-48 min-h-[3.25rem] w-full resize-none overflow-y-auto border-0 bg-transparent px-1 text-base text-gray-800 focus:outline-none focus:ring-0 disabled:cursor-not-allowed sm:text-sm"
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
