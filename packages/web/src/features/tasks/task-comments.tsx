import type { Id } from '@baton/shared'
import { type FormEvent, useState } from 'react'
import { useTaskComments } from './use-task-comments'

const fmtTime = (ms: number): string => new Date(ms).toLocaleString()

type TaskCommentsProps = { projectId: Id; taskId: Id }

// Append-only comment thread on a task: the collaboration record. Text only —
// file payloads travel over chat/Send, not here. workerId attributes the author
// (set = a worker/agent, undefined = a human via this UI).
export const TaskComments = ({ projectId, taskId }: TaskCommentsProps) => {
  const { data, loading, add } = useTaskComments(projectId, taskId)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || posting) return
    setPosting(true)
    try {
      await add(body)
      setDraft('')
    } finally {
      setPosting(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium tracking-wider text-gray-500 uppercase">Comments</h3>
      {loading && !data ? (
        <p className="text-sm text-gray-400">loading…</p>
      ) : data && data.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.map(c => (
            <li key={c.id} className="rounded-md border border-gray-100 bg-gray-50/60 p-3 text-sm">
              <div className="mb-1 flex items-center gap-2 text-xs text-gray-400">
                <span>{c.workerId !== undefined ? `worker #${c.workerId}` : 'you'}</span>
                <span aria-hidden="true">·</span>
                <span>{fmtTime(c.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-gray-700">{c.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-gray-400">no comments yet</p>
      )}
      <form onSubmit={submit} className="flex flex-col gap-2">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Leave a note…"
          rows={2}
          className="resize-y rounded-md border border-gray-200 p-2 text-sm focus:border-gray-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={posting || draft.trim().length === 0}
          className="self-end rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {posting ? 'posting…' : 'Comment'}
        </button>
      </form>
    </section>
  )
}
