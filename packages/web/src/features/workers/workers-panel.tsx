import type { Id, SessionView, WorkerView } from '@baton/shared'
import { sessionPath } from '../../app/route'
import { useSessions } from '../sessions/use-sessions'
import { useWorkers } from './use-workers'

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

// Display principle (M2.9):
//   - Session has no state field. UI doesn't invent any.
//   - LEFT = pure structure (name only).
//   - RIGHT = transient events (busy = pulse). Default state = nothing rendered.
//   - Worker offline propagates to its session group via dim styling.

type WorkerGroupProps = {
  worker: WorkerView
  sessions: SessionView[]
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
}

const WorkerGroup = ({ worker, sessions, projectId, activeId, open }: WorkerGroupProps) => {
  const alive = worker.alive
  const dim = !alive
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
      </div>
      {sessions.length === 0 ? (
        <p className="px-3 text-[11px] text-gray-400">no sessions</p>
      ) : (
        sessions.map(s => (
          <SessionRow
            key={s.id}
            session={s}
            path={sessionPath(projectId, s.id)}
            active={activeId === sessionPath(projectId, s.id)}
            dim={dim}
            open={open}
          />
        ))
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
    className={`flex w-full items-center justify-between gap-2 rounded-md pr-1.5 pl-4 py-1 text-left text-sm transition-colors duration-150 ${
      active ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-100/70'
    } ${dim ? 'opacity-60' : ''}`}
  >
    <span className="truncate">{session.name}</span>
    {session.busy && (
      <span
        role="img"
        aria-label="streaming"
        className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
      />
    )}
  </button>
)

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
