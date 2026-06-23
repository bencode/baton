import type { Id, Loop } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../app/api-context'
import { formatInterval, type IntervalUnit, intervalError, toSeconds } from './format'
import { useLoops } from './use-loops'

// One loop row: enable/disable toggle, interval, message, last-beat status, delete.
const LoopRow = ({
  loop,
  onToggle,
  onRemove,
}: {
  loop: Loop
  onToggle: () => void
  onRemove: () => void
}) => (
  <div className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-gray-50">
    <button
      type="button"
      aria-label={loop.enabled ? 'disable loop' : 'enable loop'}
      title={loop.enabled ? 'enabled — pause' : 'disabled — resume'}
      onClick={onToggle}
      className={loop.enabled ? 'text-emerald-600' : 'text-gray-300'}
    >
      {loop.enabled ? '●' : '○'}
    </button>
    <span className="shrink-0 font-mono text-gray-500">
      every {formatInterval(loop.intervalSec)}
    </span>
    <span className="min-w-0 flex-1 truncate text-gray-700">{loop.message}</span>
    {loop.lastStatus && <span className="shrink-0 text-gray-400">last:{loop.lastStatus}</span>}
    <button
      type="button"
      aria-label="delete loop"
      title="delete loop"
      onClick={onRemove}
      className="shrink-0 text-gray-300 transition-colors hover:text-red-600"
    >
      🗑
    </button>
  </div>
)

// Session-scoped loops manager: list (toggle / delete) + inline create. Sits in a
// collapsible panel under the session header. Refetch rides the project stream
// ('loops' signal, bumped server-side), so mutations need no manual refresh.
export const LoopsPanel = ({ sessionId, projectId }: { sessionId: Id; projectId: Id }) => {
  const api = useApi()
  const { data: loops, loading } = useLoops(sessionId, projectId)
  const [message, setMessage] = useState('')
  const [value, setValue] = useState(30)
  const [unit, setUnit] = useState<IntervalUnit>('min')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const intervalSec = toSeconds(value, unit)
  const ivError = intervalError(intervalSec)

  const create = async () => {
    const text = message.trim()
    if (busy || !text || ivError) return
    setBusy(true)
    setError(null)
    try {
      await api.loops.create(sessionId, { message: text, intervalSec })
      setMessage('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'create failed')
    } finally {
      setBusy(false)
    }
  }

  const toggle = (loop: Loop) =>
    void api.loops
      .update(loop.id, { enabled: !loop.enabled })
      .catch(err => console.error('toggle loop', err))
  const remove = (id: Id) =>
    void api.loops.remove(id).catch(err => console.error('remove loop', err))

  return (
    <div className="mt-2 flex flex-col gap-1 text-xs">
      {loading && <p className="text-gray-400">loading…</p>}
      {!loading && loops?.length === 0 && <p className="text-gray-400">No loops yet.</p>}
      {loops?.map(loop => (
        <LoopRow
          key={loop.id}
          loop={loop}
          onToggle={() => toggle(loop)}
          onRemove={() => remove(loop.id)}
        />
      ))}
      <form
        onSubmit={e => {
          e.preventDefault()
          void create()
        }}
        className="mt-1 flex flex-wrap items-center gap-1"
      >
        <input
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder="message sent each beat…"
          className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 outline-none focus:border-blue-400"
        />
        <input
          type="number"
          min={1}
          value={value}
          onChange={e => setValue(Number(e.target.value))}
          aria-label="interval value"
          className="w-14 rounded-md border border-gray-200 bg-white px-2 py-1 outline-none focus:border-blue-400"
        />
        <select
          value={unit}
          onChange={e => setUnit(e.target.value as IntervalUnit)}
          aria-label="interval unit"
          className="rounded-md border border-gray-200 bg-white px-1 py-1 outline-none focus:border-blue-400"
        >
          <option value="sec">sec</option>
          <option value="min">min</option>
          <option value="hour">hour</option>
          <option value="day">day</option>
        </select>
        <button
          type="submit"
          disabled={busy || !message.trim() || ivError !== null}
          aria-label="add loop"
          className="rounded-md px-2 py-1 text-gray-500 hover:bg-gray-100 disabled:opacity-40"
        >
          + add
        </button>
      </form>
      {ivError && <p className="text-amber-600">interval: {ivError}</p>}
      {error && <p className="text-red-600">{error}</p>}
    </div>
  )
}
