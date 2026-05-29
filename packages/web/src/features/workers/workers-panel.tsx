import type { Id, Session, WorkerView } from '@baton/shared'
import { sessionPath } from '../../app/route'
import { StatusDot } from '../../components/status-dot'
import { useSessions } from '../sessions/use-sessions'
import { useWorkers } from './use-workers'

type WorkersPanelProps = {
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
}

type SessionView = Session & { alive?: boolean; busy?: boolean }

const sessionDotStatus = (
  s: SessionView,
  workerAlive: boolean,
): 'idle' | 'busy' | 'closed' | 'offline' => {
  if (s.closedAt) return 'closed'
  if (!workerAlive) return 'offline'
  if (s.busy) return 'busy'
  return 'idle'
}

// Worker grouping: sessions whose machineId matches a worker land under it;
// sessions with no machineId (legacy / pre-M2.6) collect under "(no worker)".
const groupByMachine = (
  workers: WorkerView[],
  sessions: SessionView[],
): { worker: WorkerView | null; sessions: SessionView[] }[] => {
  const buckets = new Map<string | null, SessionView[]>()
  for (const w of workers) buckets.set(w.machineId, [])
  buckets.set(null, [])
  for (const s of sessions) {
    const key = s.machineId && buckets.has(s.machineId) ? s.machineId : null
    buckets.get(key)?.push(s)
  }
  const rows: { worker: WorkerView | null; sessions: SessionView[] }[] = workers.map(w => ({
    worker: w,
    sessions: buckets.get(w.machineId) ?? [],
  }))
  const orphans = buckets.get(null) ?? []
  if (orphans.length > 0) rows.push({ worker: null, sessions: orphans })
  return rows
}

export const WorkersPanel = ({ projectId, activeId, open }: WorkersPanelProps) => {
  const { data: workers } = useWorkers(projectId)
  const { data: sessions } = useSessions(projectId)
  if (!workers || !sessions) return <p className="px-2 text-sm text-gray-400">loading…</p>
  if (workers.length === 0 && sessions.length === 0)
    return <p className="px-2 text-sm text-gray-400">No workers yet.</p>
  const groups = groupByMachine(workers, sessions as SessionView[])
  return (
    <div className="flex flex-col gap-3">
      {groups.map(g => (
        <WorkerGroup
          key={g.worker?.machineId ?? '__orphans__'}
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

type WorkerGroupProps = {
  worker: WorkerView | null
  sessions: SessionView[]
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
}

const WorkerGroup = ({ worker, sessions, projectId, activeId, open }: WorkerGroupProps) => {
  const alive = worker?.alive ?? false
  const dim = !alive && worker !== null
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`flex items-center gap-2 px-1 text-xs ${dim ? 'text-gray-400' : 'text-gray-600'}`}
      >
        <StatusDot status={alive ? 'idle' : 'offline'} />
        <span className="font-semibold tracking-wide uppercase">
          {worker ? worker.name : '(no worker)'}
        </span>
        {worker && <span className="font-mono text-[10px] text-gray-400">{worker.hostname}</span>}
        {!alive && worker && <span className="text-[10px] text-gray-400">offline</span>}
      </div>
      {sessions.length === 0 ? (
        <p className="px-3 text-[11px] text-gray-400">no sessions</p>
      ) : (
        sessions.map(s => {
          const path = sessionPath(projectId, s.id)
          const active = activeId === path
          return (
            <button
              type="button"
              key={s.id}
              onClick={() => open(path, s.name)}
              className={`flex w-full items-center gap-2 rounded-md pr-1.5 pl-4 py-1 text-left text-sm transition-colors duration-150 ${
                active ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-100/70'
              } ${dim ? 'opacity-60' : ''}`}
            >
              <StatusDot status={sessionDotStatus(s, alive)} />
              <span className="shrink-0 font-mono text-xs text-gray-400">#{s.id}</span>
              <span className="truncate">{s.name}</span>
            </button>
          )
        })
      )}
    </div>
  )
}
