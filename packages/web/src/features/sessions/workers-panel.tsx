import type { Id } from '@baton/shared'
import { itemPath } from '../../app/route'
import { StatusDot } from '../../components/status-dot'
import { useAssignments } from '../assignments/use-assignments'
import { useSessions } from './use-sessions'

type WorkersPanelProps = {
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
}

// Workers section under the left panel: one row per session + its running
// assignments inline. Polling is centralised inside the two hooks; assignments
// scope to running so the panel doesn't grow indefinitely with completed work.
export const WorkersPanel = ({ projectId, activeId, open }: WorkersPanelProps) => {
  const { data: sessions } = useSessions(projectId)
  const { data: assignments } = useAssignments(projectId, { status: ['running'] })
  // sessions/assignments share the project scope and live-poll independently.
  if (!sessions || sessions.length === 0)
    return <p className="px-2 text-sm text-gray-400">No workers connected.</p>
  return (
    <div className="flex flex-col gap-1">
      {sessions.map(s => {
        const running = (assignments ?? []).filter(a => a.sessionId === s.id)
        return (
          <div key={s.id} className="flex flex-col">
            <div className="flex items-center gap-2 px-1.5 py-1 text-sm text-gray-800">
              <StatusDot status={s.status} />
              <span className="shrink-0 font-mono text-xs text-gray-400">{s.code}</span>
              <span className="truncate font-semibold tracking-tight">{s.name}</span>
              <span className="ml-auto truncate font-mono text-[11px] text-gray-400">
                {s.capabilities.join(',') || '-'}
              </span>
            </div>
            {running.map(a => {
              const path = itemPath(projectId, a.code)
              const active = activeId === path
              return (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => open(path, `${a.code}`)}
                  className={`flex w-full items-center gap-2 rounded-md py-1 pr-2 pl-7 text-left text-xs transition-colors duration-150 ${
                    active ? 'bg-blue-50 text-blue-900' : 'text-gray-600 hover:bg-gray-100/70'
                  }`}
                >
                  <span className="font-mono text-gray-400" aria-hidden="true">
                    ↳
                  </span>
                  <span className="font-mono text-gray-500">{a.code}</span>
                  <span className="truncate">task #{a.taskId}</span>
                  <StatusDot status={a.status} className="ml-auto" />
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
