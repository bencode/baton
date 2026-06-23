import type { Attachment } from '@baton/shared'
import { useRef } from 'react'
import { AttachmentStrip } from '../../../components/attachments/attachment-strip'
import { useAutosize } from '../../../hooks/use-autosize'
import { useDropZone } from '../../../hooks/use-drop-zone'
import { extractImageFiles, insertLabelToken } from '../../../utils/attachment'
import { CommandMenu } from './command-menu'
import type { SlashCommand } from './commands'
import { PaperclipIcon, SendIcon, Spinner } from './icons'
import { useSlashCommands } from './use-slash-commands'

// Session-wide status chips above the textarea (plan mode, model override):
// one full-width click target whose click toggles/resets the state. Tones are
// full literal class strings so Tailwind's scanner sees them.
const CHIP_TONES = {
  amber: {
    chip: 'bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100',
    hint: 'text-amber-500',
  },
  indigo: {
    chip: 'bg-indigo-50 text-indigo-700 ring-indigo-200 hover:bg-indigo-100',
    hint: 'text-indigo-400',
  },
} as const

type StatusChipProps = {
  tone: keyof typeof CHIP_TONES
  label: string
  hint: string
  onClick: () => void
}

const StatusChip = ({ tone, label, hint, onClick }: StatusChipProps) => (
  <button
    type="button"
    onClick={onClick}
    className={`mb-2 flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium ring-1 transition-colors ${CHIP_TONES[tone].chip}`}
  >
    {label}
    <span className={`ml-auto ${CHIP_TONES[tone].hint}`}>{hint}</span>
  </button>
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
  // Session-wide read-only plan mode + its toggle (/plan command, Shift+Tab).
  planMode: boolean
  onTogglePlanMode: () => void
  // Session-wide model override (/model <name>); null = default. Clicking the
  // chip resets, same as a bare /model.
  model: string | null
  onResetModel: () => void
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
  model,
  onResetModel,
}: ComposerProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const { dragging, dropProps } = useDropZone(onAddFiles)
  const slash = useSlashCommands(draft, setDraft, onCommand, onTogglePlanMode)
  useAutosize(textareaRef, draft)
  const busy = sending || uploading
  const canSend = active && !busy && (draft.trim().length > 0 || attachments.length > 0)
  const insertLabel = (label: string) =>
    insertLabelToken(textareaRef.current, draft, setDraft, label)
  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:px-3 sm:pt-3 sm:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        {...dropProps}
        className={`mx-auto min-w-0 max-w-5xl rounded-xl border px-3 py-2 transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${dragging ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'} ${active ? 'bg-white' : 'bg-gray-50'}`}
      >
        {planMode && (
          <StatusChip
            tone="amber"
            label="📋 PLAN MODE · 只读规划，不改文件"
            hint="Shift+Tab 退出"
            onClick={onTogglePlanMode}
          />
        )}
        {model && (
          <StatusChip
            tone="indigo"
            label={`🧠 MODEL · ${model}`}
            hint="点击重置为默认"
            onClick={onResetModel}
          />
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
            // Negative margin grows the tap target to ~28px without nudging the
            // 16px glyph or the row height — comfortable on touch, unchanged on desktop.
            className="-m-1.5 p-1.5 text-gray-400 transition-colors hover:text-gray-700 disabled:opacity-40"
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
            className="ml-auto flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 text-white transition-colors hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 sm:h-8 sm:w-8"
          >
            {busy ? <Spinner /> : <SendIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}
