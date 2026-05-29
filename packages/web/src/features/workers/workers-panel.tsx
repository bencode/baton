import type { Id, Session, WorkerView } from '@baton/shared'
import { sessionPath } from '../../app/route'
import { StateChip } from '../../components/state-chip'
import { useSessions } from '../sessions/use-sessions'
import { useWorkers } from './use-workers'

type WorkersPanelProps = {
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
}

type SessionView = Session & { alive?: boolean; attached?: boolean; busy?: boolean }
type SessionStatus = 'idle' | 'streaming' | 'detached' | 'closed' | 'offline'

// 5-state ladder, ordered by priority. `attached` distinguishes 'this session
// has a daemon pinging' from 'just the machine is up' — without it, sessions
// whose daemon was killed look identical to ready ones and the user sends
// into a queue with no one listening.
const sessionStatus = (s: SessionView, workerAlive: boolean): SessionStatus => {
  if (s.closedAt) return 'closed'
  if (!workerAlive) return 'offline'
  if (!s.attached) return 'detached'
  if (s.busy) return 'streaming'
  return 'idle'
}

// Worker grouping by FK: Session.workerId === Worker.id. Schema guarantees
// every session has a worker (M2.6.1 FK Restrict), so there's no orphan bucket.
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

// Layout principle (per design review):
//   - LEFT column = structure (name, hierarchy). No status glyphs that look
//     like list bullets.
//   - RIGHT column = state. Status chips / pulse / text show up only when
//     non-default; idle ⇒ clean.
// Worker rows keep a tiny presence dot before the name — visually distinct
// from the (now bullet-free) session rows, so the hierarchy reads instantly.

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
        {!alive && <span className="ml-auto text-[10px] text-gray-400">offline</span>}
      </div>
      {sessions.length === 0 ? (
        <p className="px-3 text-[11px] text-gray-400">no sessions</p>
      ) : (
        sessions.map(s => (
          <SessionRow
            key={s.id}
            session={s}
            status={sessionStatus(s, alive)}
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
  status: SessionStatus
  path: string
  active: boolean
  dim: boolean
  open: (id: string, title: string) => void
}

const SessionRow = ({ session, status, path, active, dim, open }: SessionRowProps) => (
  <button
    type="button"
    onClick={() => open(path, session.name)}
    className={`flex w-full items-center justify-between gap-2 rounded-md pr-1.5 pl-4 py-1 text-left text-sm transition-colors duration-150 ${
      active ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-100/70'
    } ${dim ? 'opacity-60' : ''}`}
  >
    <span className={`truncate ${status === 'closed' ? 'line-through opacity-60' : ''}`}>
      {session.name}
    </span>
    <SessionStateChip status={status} />
  </button>
)

// Tiny presence dot for the worker header. Solid emerald = online; solid gray
// = offline. Same role as Slack's avatar dot — pure "here-or-not", not a
// session state.
const PresenceDot = ({ online }: { online: boolean }) => (
  <span
    role="img"
    aria-label={online ? 'online' : 'offline'}
    className={`h-2 w-2 shrink-0 rounded-full ${online ? 'bg-emerald-500' : 'bg-gray-300'}`}
  />
)

// Right-column status indicator — shares the project-wide StateChip vocabulary
// (pulse for in-motion states, muted text for inactive states). idle renders
// nothing: absence of a chip IS "ready", the calm baseline.
const SessionStateChip = ({ status }: { status: SessionStatus }) => {
  if (status === 'idle') return <StateChip kind="none" />
  if (status === 'streaming') return <StateChip kind="pulse" label="streaming" />
  return <StateChip kind="text" label={status} tone="muted" />
}
