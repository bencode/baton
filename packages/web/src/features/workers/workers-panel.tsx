import type { Id, SessionView, WorkerView } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../app/api-context'
import { sessionPath } from '../../app/route'
import { useSessions } from '../sessions/use-sessions'
import { useWorkers } from './use-workers'

// Keep the rail scannable when a worker owns many sessions: active first, then
// recent inactive; collapse the long inactive tail behind a toggle.
const VISIBLE_BUDGET = 10
const isLive = (s: SessionView): boolean => s.busy || s.attached
const orderSessions = (sessions: SessionView[]): SessionView[] => {
  const live = sessions.filter(isLive)
  const idle = sessions.filter(s => !isLive(s)).sort((a, b) => b.id - a.id)
  return [...live, ...idle]
}

type WorkersPanelProps = {
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
}

// Worker grouping by FK: Session.workerId === Worker.id. Schema guarantees
// every session has a worker (M2.6.1 FK Cascade). Destroyed sessions are
// physically gone — they don't appear in the list at all.
const groupByWorker = (
  workers: WorkerView[],
  sessions: SessionView[],
): { worker: WorkerView; sessions: SessionView[] }[] => {
  const buckets = new Map<Id, SessionView[]>()
  for (const w of workers) buckets.set(w.id, [])
  for (const s of sessions) buckets.get(s.workerId)?.push(s)
  return workers.map(w => ({ worker: w, sessions: buckets.get(w.id) ?? [] }))
}

export const WorkersPanel = ({ projectId, activeId, open }: WorkersPanelProps) => {
  const { data: workers } = useWorkers(projectId)
  const { data: sessions } = useSessions(projectId)
  if (!workers || !sessions) return <p className="px-2 text-sm text-gray-400">loading…</p>
  if (workers.length === 0) return <p className="px-2 text-sm text-gray-400">No workers yet.</p>
  const groups = groupByWorker(workers, sessions as SessionView[])
  return (
    <div className="flex flex-col gap-3">
      {groups.map(g => (
        <WorkerGroup
          key={g.worker.id}
          worker={g.worker}
          sessions={g.sessions}
          projectId={projectId}
          activeId={activeId}
          open={open}
        />
      ))}
    </div>
  )
}

// Display principle:
//   - A leading dot carries runtime liveness: busy (amber pulse) > active
//     (emerald) > inactive (hollow). All derived from the SessionView, never invented.
//   - Worker offline dims its whole group; a live worker gets a "+ new session".

type WorkerGroupProps = {
  worker: WorkerView
  sessions: SessionView[]
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
}

const WorkerGroup = ({ worker, sessions, projectId, activeId, open }: WorkerGroupProps) => {
  const api = useApi()
  const [expanded, setExpanded] = useState(false)
  const alive = worker.alive
  const dim = !alive
  // Create nameless → server assigns `session-<id>`, the worker auto-titles it
  // after the first turn. Open it straight away (no prompt).
  const createSession = () => {
    void api.sessions
      .create({ projectId, workerId: worker.id })
      .then(s => open(sessionPath(projectId, s.id), s.name))
      .catch(() => {})
  }
  const ordered = orderSessions(sessions)
  const visible = expanded ? ordered : ordered.slice(0, VISIBLE_BUDGET)
  const hidden = ordered.length - visible.length
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-2 px-1 text-xs ${dim ? 'text-gray-400' : 'text-gray-700'}`}
      >
        <PresenceDot online={alive} />
        <span className="font-semibold tracking-wide">{worker.name}</span>
        {worker.hostname !== worker.name && (
          <span className="font-mono text-[10px] text-gray-400">{worker.hostname}</span>
        )}
        {alive && (
          <button
            type="button"
            onClick={createSession}
            aria-label="new session"
            title="new session"
            className="ml-auto px-1 text-base leading-none text-gray-400 transition-colors hover:text-blue-700"
          >
            +
          </button>
        )}
      </div>
      {visible.map(s => (
        <SessionRow
          key={s.id}
          session={s}
          path={sessionPath(projectId, s.id)}
          active={activeId === sessionPath(projectId, s.id)}
          dim={dim}
          open={open}
        />
      ))}
      {(hidden > 0 || expanded) && ordered.length > VISIBLE_BUDGET && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="px-4 py-0.5 text-left text-[11px] text-gray-400 transition-colors hover:text-gray-700"
        >
          {expanded ? '▾ less' : `▸ ${hidden} more`}
        </button>
      )}
    </div>
  )
}

type SessionRowProps = {
  session: SessionView
  path: string
  active: boolean
  dim: boolean
  open: (id: string, title: string) => void
}

const SessionRow = ({ session, path, active, dim, open }: SessionRowProps) => (
  <button
    type="button"
    onClick={() => open(path, session.name)}
    className={`flex w-full items-center gap-2 rounded-md py-1 pr-1.5 pl-3 text-left text-sm transition-colors duration-150 ${
      active ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-100/70'
    } ${dim ? 'opacity-60' : ''}`}
  >
    <SessionDot session={session} />
    <span className="truncate">{session.name}</span>
  </button>
)

// Session liveness at a glance: busy = amber pulse, active (worker child up) =
// solid emerald, inactive = hollow outline (shape difference reads at 6px).
const SessionDot = ({ session }: { session: SessionView }) => {
  if (session.busy)
    return (
      <span
        role="img"
        aria-label="busy"
        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
      />
    )
  if (session.attached)
    return (
      <span
        role="img"
        aria-label="active"
        className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
      />
    )
  return (
    <span
      role="img"
      aria-label="inactive"
      className="h-1.5 w-1.5 shrink-0 rounded-full border border-gray-400 bg-transparent"
    />
  )
}

// Worker presence dot. Solid emerald (online) vs hollow outline (offline) —
// shape difference (not just color) reads even at 8px.
const PresenceDot = ({ online }: { online: boolean }) =>
  online ? (
    <span role="img" aria-label="online" className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
  ) : (
    <span
      role="img"
      aria-label="offline"
      className="h-2 w-2 shrink-0 rounded-full border border-gray-400 bg-transparent"
    />
  )
