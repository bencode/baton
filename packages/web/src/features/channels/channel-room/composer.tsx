import type { Attachment, ChannelMember } from '@baton/shared'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'
import { AttachmentStrip } from '../../../components/attachments/attachment-strip'
import { extractImageFiles, renamePasted } from '../../../utils/attachment'

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

// The @-token under the caret (word starting with @), used to filter the dropdown;
// null when the caret isn't in a mention.
const mentionQuery = (text: string, caret: number): string | null =>
  text.slice(0, caret).match(/@([^\s@]*)$/)?.[1] ?? null

// Message input — a rounded card holding (top→bottom) a pending-attachment strip,
// a borderless auto-growing textarea, and a toolbar (📎 left, send right). Enter
// sends (Shift+Enter newline) or completes the highlighted @mention; files attach
// via the 📎 picker, drag-drop, or paste. Send is gated on text OR an attachment.
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
  const [query, setQuery] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure height on each text change (used indirectly via scrollHeight)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const suggestions =
    query === null
      ? []
      : members
          .filter(m => m.name !== me && m.name.toLowerCase().startsWith(query.toLowerCase()))
          .slice(0, 6)

  const sync = () => {
    const el = ref.current
    if (el) setQuery(mentionQuery(el.value, el.selectionStart))
  }

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
      if (ok.length < results.length) setUploadError(`${results.length - ok.length} 个文件上传失败`)
    } finally {
      setUploading(false)
    }
  }

  const pick = (name: string) => {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart
    const before = text.slice(0, caret).replace(/@([^\s@]*)$/, `@${name} `)
    setText(before + text.slice(caret))
    setQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(before.length, before.length)
    })
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
    setQuery(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const first = suggestions[0]
      if (first) pick(first.name)
      else submit()
    }
  }

  const canSend = text.trim().length > 0 || attachments.length > 0

  return (
    <div className="shrink-0 border-t border-gray-200 bg-white px-4 py-2">
      <div className="relative mx-auto max-w-3xl">
        {suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md">
            {suggestions.map(m => (
              <button
                key={m.name}
                type="button"
                onMouseDown={e => {
                  e.preventDefault()
                  pick(m.name)
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${m.kind === 'agent' ? 'bg-violet-500' : 'bg-emerald-500'}`}
                />
                {m.name}
                <span className="ml-auto text-xs text-gray-400">{m.kind}</span>
              </button>
            ))}
          </div>
        )}
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
          <textarea
            ref={ref}
            rows={1}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyUp={sync}
            onClick={sync}
            onPaste={e => {
              const files = extractImageFiles(e.clipboardData.items)
              if (files.length === 0) return
              e.preventDefault()
              void addFiles(files)
            }}
            onKeyDown={onKeyDown}
            placeholder="说点什么…  Enter 发送 · Shift+Enter 换行 · @ 提到某人"
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
              {uploading ? '上传中…' : '发送'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
