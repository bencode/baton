import type { Attachment, ChannelMember } from '@baton/shared'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { AttachmentStrip } from '../../../components/attachments/attachment-strip'
import { extractImageFiles, renamePasted } from '../../../utils/attachment'
import { useMentions } from './use-mentions'

// Recipients = @mentions that match an online member (deduped); empty = broadcast.
const recipientsFrom = (text: string, members: ChannelMember[]): string[] => {
  const names = new Set(members.map(m => m.name))
  const hit = new Set<string>()
  for (const m of text.matchAll(/@([^\s@]+)/g)) {
    const n = m[1]
    if (n && names.has(n)) hit.add(n)
  }
  return [...hit]
}

// Message input — a rounded card holding (top→bottom) a pending-attachment strip,
// the @-mention autocomplete, a borderless auto-growing textarea, and a toolbar
// (📎 left, send right). The mention menu is keyboard-driven (↑↓ / Enter|Tab / Esc,
// via useMentions) and sits inline above the textarea; Enter otherwise sends,
// Shift+Enter newlines. Files attach via the 📎 picker, drag-drop, or paste. Send
// is gated on text OR an attachment.
export const Composer = ({
  members,
  me,
  onSend,
  onUpload,
  attachmentUrl,
}: {
  members: ChannelMember[]
  me: string
  onSend: (text: string, to: string[], attachments: Attachment[]) => Promise<void>
  onUpload: (file: File) => Promise<Attachment>
  attachmentUrl: (att: Attachment) => string
}) => {
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mentions = useMentions(text, setText, ref, members, me)

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure height on each text change (used indirectly via scrollHeight)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  // Upload all picked/dropped/pasted files at once; keep the successes, surface a
  // count of any failures. Pasted images have no name → give them a stable one.
  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    setUploadError(null)
    try {
      const results = await Promise.allSettled(
        files.map((file, i) => onUpload(file.name ? file : renamePasted(file, i))),
      )
      const ok = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
      if (ok.length) setAttachments(prev => [...prev, ...ok])
      if (ok.length < results.length)
        setUploadError(`${results.length - ok.length} file(s) failed to upload`)
    } finally {
      setUploading(false)
    }
  }

  // Insert a {label} reference token at the caret so the user can cite a pending
  // attachment in their text.
  const insertLabel = (label: string) => {
    const el = ref.current
    const caret = el?.selectionStart ?? text.length
    const token = `{${label}} `
    setText(text.slice(0, caret) + token + text.slice(caret))
    requestAnimationFrame(() => {
      const pos = caret + token.length
      el?.focus()
      el?.setSelectionRange(pos, pos)
    })
  }

  const submit = () => {
    const body = text.trim()
    if (!body && attachments.length === 0) return
    void onSend(body, recipientsFrom(body, members), attachments)
    setText('')
    setAttachments([])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentions.onKeyDown(e)) return // the mention menu consumed it (nav / pick / close)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  const canSend = text.trim().length > 0 || attachments.length > 0

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2">
      <div className="mx-auto max-w-3xl">
        {/* biome-ignore lint/a11y/noStaticElementInteractions: the input card is the drop zone */}
        <div
          onDragOver={e => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => {
            e.preventDefault()
            setDragging(false)
            void addFiles(Array.from(e.dataTransfer.files))
          }}
          className={`rounded-xl border px-3 pt-2 pb-1.5 transition-colors focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 ${dragging ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-300'}`}
        >
          {attachments.length > 0 && (
            <AttachmentStrip
              attachments={attachments}
              onRemove={id => setAttachments(prev => prev.filter(a => a.id !== id))}
              onInsertLabel={insertLabel}
              src={attachmentUrl}
            />
          )}
          {uploadError && <p className="mb-1 text-xs text-red-600">{uploadError}</p>}
          {mentions.open && (
            <div className="mb-1.5 w-fit min-w-[9rem] max-w-[18rem] overflow-hidden rounded-md border border-gray-200 bg-white shadow-md">
              {mentions.suggestions.map((m, i) => (
                <button
                  key={m.name}
                  type="button"
                  onMouseDown={e => {
                    e.preventDefault()
                    mentions.pick(m.name)
                  }}
                  onMouseEnter={() => mentions.setIndex(i)}
                  className={`flex w-full items-center gap-2 px-2.5 py-1 text-left text-sm ${i === mentions.activeIndex ? 'bg-blue-50 text-blue-900' : 'hover:bg-gray-50'}`}
                  title={m.name}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.kind === 'agent' ? 'bg-violet-500' : 'bg-emerald-500'}`}
                  />
                  <span className="truncate">{m.name}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={ref}
            rows={1}
            value={text}
            onChange={e => {
              setText(e.target.value)
              mentions.resetIndex()
              mentions.sync()
            }}
            onKeyUp={mentions.sync}
            onClick={mentions.sync}
            onPaste={e => {
              const files = extractImageFiles(e.clipboardData.items)
              if (files.length === 0) return
              e.preventDefault()
              void addFiles(files)
            }}
            onKeyDown={onKeyDown}
            placeholder="Say something…  Enter to send · Shift+Enter for newline · @ to mention"
            className="max-h-40 min-h-[2.5rem] w-full resize-none border-0 bg-transparent px-1 py-1 text-sm text-gray-800 outline-none placeholder:text-gray-400"
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="attach files"
              className="-m-1 p-1 text-lg text-gray-400 transition-colors hover:text-gray-700"
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => {
                void addFiles(Array.from(e.target.files ?? []))
                e.target.value = ''
              }}
            />
            <button
              type="button"
              onClick={submit}
              disabled={!canSend || uploading}
              className="ml-auto rounded-lg bg-gray-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-40"
            >
              {uploading ? 'Uploading…' : 'Send'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
