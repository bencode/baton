import type { Attachment, Id } from '@baton/shared'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { reduceEvents } from './event-render'
import { Composer, ConnectionBanner, EventStream, SessionHeader } from './session-detail/parts'
import { useSessionStream } from './use-session-stream'
import { useSession, useSessions } from './use-sessions'

type SessionDetailProps = { projectId: Id; sessionId: Id }

// Clipboard images arrive as a File with an empty name; give it a stable one
// (File.name is read-only, so wrap it) so the upload + worktree filename read
// well. The batch index keeps concurrently-pasted blobs from colliding on name.
const renamePasted = (file: File, i: number): File => {
  const ext = file.type.split('/')[1] ?? 'bin'
  return new File([file], `paste-${Date.now()}-${i}.${ext}`, { type: file.type })
}

// Render a Session as a chat. Looks up the session by int id; the list query
// from `useSessions` re-polls so we can use its fresher copy when available.
export const SessionDetail = ({ projectId, sessionId }: SessionDetailProps) => {
  const api = useApi()
  const { data: sessionShallow } = useSession(sessionId)
  const { data: liveSessions } = useSessions(projectId)
  const session = liveSessions?.find(s => s.id === sessionId) ?? sessionShallow
  const { events, status } = useSessionStream(session?.id ?? null)
  const items = useMemo(() => reduceEvents(events), [events])
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  // Auto-scroll the event list to the bottom whenever new items arrive.
  const scrollRef = useRef<HTMLDivElement | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: items.length is the intended trigger
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [items.length])

  if (!session) return <div className="p-6 text-sm text-gray-400">loading…</div>

  // Upload the batch concurrently; append every success and surface a count of
  // any failures instead of silently dropping the rest of the batch. Files
  // pasted from the clipboard often have an empty name — give them one.
  const addFiles = async (files: File[]) => {
    if (files.length === 0) return
    setUploading(true)
    setUploadError(null)
    try {
      const results = await Promise.allSettled(
        files.map((file, i) =>
          api.sessions.uploadAttachment(sessionId, file.name ? file : renamePasted(file, i)),
        ),
      )
      const ok = results.flatMap(r => (r.status === 'fulfilled' ? [r.value] : []))
      if (ok.length > 0) setAttachments(prev => [...prev, ...ok])
      const failed = results.length - ok.length
      if (failed > 0) setUploadError(`${failed} 个文件上传失败`)
    } finally {
      setUploading(false)
    }
  }

  const removeAttachment = (id: string) =>
    // The orphaned server blob is transient (cascade-cleaned on session destroy); fine for v0.
    setAttachments(prev => prev.filter(a => a.id !== id))

  const send = async () => {
    const text = draft.trim()
    if (!text && attachments.length === 0) return
    setSending(true)
    try {
      await api.sessions.sendMessage(sessionId, text, attachments)
      setDraft('')
      setAttachments([])
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <SessionHeader session={session} streamStatus={status} />
      <ConnectionBanner streamStatus={status} alive={session.alive} attached={session.attached} />
      <EventStream items={items} scrollRef={scrollRef} />
      <Composer
        draft={draft}
        setDraft={setDraft}
        attachments={attachments}
        onAddFiles={files => void addFiles(files)}
        onRemoveAttachment={removeAttachment}
        uploading={uploading}
        uploadError={uploadError}
        sending={sending}
        onSend={() => void send()}
      />
    </div>
  )
}
