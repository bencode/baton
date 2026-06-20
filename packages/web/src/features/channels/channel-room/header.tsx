import type { ChannelManifest, ChannelMember } from '@baton/shared'
import { type KeyboardEvent, useState } from 'react'
import { StatusDot } from '../../../components/status-dot'
import type { ChannelStreamState } from '../use-channel-stream'

// Connection state → the header dot. open=live (green), error=offline, else busy.
const dot = (s: ChannelStreamState['status']): 'idle' | 'offline' | 'busy' =>
  s === 'open' ? 'idle' : s === 'error' ? 'offline' : 'busy'

// Inline display-name editor: the "我是 X" affordance turns into a text field on
// click. Enter renames in place (claim new → release old, via onRename); a taken
// name shows a hint without leaving the room; Esc or click-away cancels. No
// full-screen gate, no self-collision dead-end.
const NameTag = ({
  me,
  onRename,
}: {
  me: string
  onRename: (next: string) => Promise<{ ok: boolean }>
}) => {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(me)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const start = () => {
    setDraft(me)
    setError('')
    setEditing(true)
  }
  const cancel = () => {
    if (busy) return
    setEditing(false)
    setError('')
  }
  const submit = async () => {
    if (busy) return
    setBusy(true)
    const { ok } = await onRename(draft)
    setBusy(false)
    if (ok) setEditing(false)
    else setError('名字被占用，换一个')
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (!editing)
    return (
      <button
        type="button"
        onClick={start}
        className="shrink-0 text-xs text-gray-400 hover:text-gray-700"
      >
        我是 {me} ✎
      </button>
    )
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <input
        // biome-ignore lint/a11y/noAutofocus: inline rename field, opened on click
        autoFocus
        value={draft}
        onChange={e => {
          setDraft(e.target.value)
          setError('')
        }}
        onKeyDown={onKeyDown}
        onBlur={cancel}
        disabled={busy}
        placeholder="新名字 · Enter 确认 · Esc 取消"
        className="w-44 rounded-md border border-gray-300 px-2 py-0.5 text-xs outline-none focus:border-gray-900"
      />
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  )
}

export const ChannelHeader = ({
  manifest,
  members,
  me,
  status,
  onRename,
}: {
  manifest: ChannelManifest
  members: ChannelMember[]
  me: string
  status: ChannelStreamState['status']
  onRename: (next: string) => Promise<{ ok: boolean }>
}) => (
  <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-200 px-4 py-2">
    <StatusDot status={dot(status)} />
    <span className="min-w-0 max-w-[40%] truncate font-mono text-[13px] font-semibold tracking-tight">
      {manifest.title || '聊天室'}
    </span>
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
      {members.map(m => (
        <span
          key={m.name}
          title={m.kind}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
            m.name === me ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${m.kind === 'agent' ? 'bg-violet-500' : 'bg-emerald-500'}`}
          />
          {m.name}
        </span>
      ))}
    </div>
    <NameTag me={me} onRename={onRename} />
  </header>
)
