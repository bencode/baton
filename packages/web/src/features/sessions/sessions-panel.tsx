import type { Id } from '@baton/shared'
import { sessionPath } from '../../app/route'
import { StatusDot } from '../../components/status-dot'
import { useSessions } from './use-sessions'

type SessionsPanelProps = {
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
}

// Derive the dot status from the session view (alive/busy + closedAt).
// Closed > offline > busy > idle. The server returns alive/busy on view
// endpoints; if a client somehow has only a bare Session, default to idle.
const sessionDotStatus = (s: {
  closedAt?: number
  alive?: boolean
  busy?: boolean
}): 'idle' | 'busy' | 'closed' | 'offline' => {
  if (s.closedAt) return 'closed'
  if (!s.alive) return 'offline'
  if (s.busy) return 'busy'
  return 'idle'
}

// Sessions section: one row per Session in this project. Click → open the
// session as a chat tab. Worker grouping by machineId lands in C3.
export const SessionsPanel = ({ projectId, activeId, open }: SessionsPanelProps) => {
  const { data: sessions } = useSessions(projectId)
  if (!sessions || sessions.length === 0)
    return <p className="px-2 text-sm text-gray-400">No sessions yet.</p>
  return (
    <div className="flex flex-col gap-1">
      {sessions.map(s => {
        const path = sessionPath(projectId, s.id)
        const active = activeId === path
        return (
          <button
            type="button"
            key={s.id}
            onClick={() => open(path, s.name)}
            className={`flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm transition-colors duration-150 ${
              active ? 'bg-blue-50 text-blue-900' : 'text-gray-700 hover:bg-gray-100/70'
            }`}
          >
            <StatusDot status={sessionDotStatus(s as never)} />
            <span className="shrink-0 font-mono text-xs text-gray-400">#{s.id}</span>
            <span className="truncate">{s.name}</span>
          </button>
        )
      })}
    </div>
  )
}
