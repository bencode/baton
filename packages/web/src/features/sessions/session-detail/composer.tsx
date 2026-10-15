import type { AgentEffort, AgentKind, Attachment } from '@baton/shared'
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
    chip: 'bg-ui-warning-surface text-ui-warning ring-ui-warning-border hover:bg-ui-warning-surface',
    hint: 'text-ui-warning',
  },
  indigo: {
    chip: 'bg-ui-selected text-ui-selected-text ring-ui-accent-border hover:bg-ui-hover',
    hint: 'text-ui-selected-muted',
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
    className={`ui-focus mb-2 flex min-h-11 w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium ring-1 transition-colors md:min-h-0 [@media(pointer:coarse)]:min-h-11 ${CHIP_TONES[tone].chip}`}
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
  // Session-wide model + effort override (/model <name> [effort]); null = default.
  // Clicking the chip resets both, same as a bare /model.
  model: string | null
  effort: AgentEffort | null
  onResetModel: () => void
  // Which agent this session runs — picks the /model preset list.
  agentKind: AgentKind
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
  effort,
  onResetModel,
  agentKind,
}: ComposerProps) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const { dragging, dropProps } = useDropZone(onAddFiles)
  const slash = useSlashCommands(draft, setDraft, onCommand, onTogglePlanMode, agentKind)
  useAutosize(textareaRef, draft)
  const busy = sending || uploading
  const canSend = active && !busy && (draft.trim().length > 0 || attachments.length > 0)
  const insertLabel = (label: string) =>
    insertLabelToken(textareaRef.current, draft, setDraft, label)
  return (
    <div className="shrink-0 border-t border-ui-border bg-ui-surface px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:px-5 md:pt-3 md:pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div
        {...dropProps}
        className={`mx-auto min-w-0 max-w-5xl rounded-lg border px-3 py-2 transition-colors focus-within:border-ui-accent focus-within:ring-1 focus-within:ring-ui-accent ${dragging ? 'border-ui-accent ring-1 ring-ui-accent' : 'border-ui-border'} ${active ? 'bg-ui-surface' : 'bg-ui-panel'}`}
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
            label={`🧠 MODEL · ${model}${effort ? ` · ${effort}` : ''}`}
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
        {uploadError && <p className="mb-2 text-xs text-ui-danger">{uploadError}</p>}
        {sendError && <p className="mb-2 text-xs text-ui-danger">{sendError}</p>}
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
          // zooms any input < 16px); md: restores the desktop 14px density.
          className="max-h-48 min-h-[3.25rem] w-full resize-none overflow-y-auto border-0 bg-transparent px-1 text-base text-ui-text placeholder:text-ui-muted focus:outline-none focus:ring-0 disabled:cursor-not-allowed md:text-sm"
        />
        <div className="mt-1.5 flex items-center">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={!active}
            aria-label="attach files"
            className="ui-icon-button"
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
            className="ui-icon-button ml-auto bg-ui-accent text-white hover:bg-ui-accent-hover hover:text-white disabled:bg-ui-border disabled:text-ui-muted"
          >
            {busy ? <Spinner /> : <SendIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}
