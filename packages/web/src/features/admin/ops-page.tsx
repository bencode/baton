import type { AdminOverview } from '@baton/shared'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { relativeTime } from '../sessions/relative-time'

const POLL_MS = 5000
const MAX_ROWS = 6 // sessions shown per worker card; the rest folds into "+N"

type OpsWorker = AdminOverview['workers'][number]
type OpsSession = AdminOverview['sessions'][number]

// Busy first, then attached, then most recently active — the board reads
// top-down as "what is running right now".
const sessionOrder = (a: OpsSession, b: OpsSession): number =>
  Number(b.busy) - Number(a.busy) ||
  Number(b.attached) - Number(a.attached) ||
  b.lastActiveAt - a.lastActiveAt

// Cards with activity float to the top: busy count, then alive, then size.
const workerOrder =
  (sessionsOf: (w: OpsWorker) => OpsSession[]) =>
  (a: OpsWorker, b: OpsWorker): number => {
    const [sa, sb] = [sessionsOf(a), sessionsOf(b)]
    const busy = (xs: OpsSession[]) => xs.filter(s => s.busy).length
    return (
      busy(sb) - busy(sa) ||
      Number(b.alive) - Number(a.alive) ||
      sb.length - sa.length ||
      a.id - b.id
    )
  }

const StatusDot = ({ session }: { session: OpsSession }) => {
  if (session.busy)
    return <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-400" />
  if (session.attached) return <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
  return <span className="h-2 w-2 shrink-0 rounded-full bg-gray-700" />
}

// Plain <a> + _blank (not router Link): the board is a wall display — drilling
// into a session must not navigate the wall away.
const SessionRow = ({ session }: { session: OpsSession }) => (
  <a
    href={`/proj/${session.projectId}/session/${session.id}`}
    target="_blank"
    rel="noreferrer"
    className="flex items-center gap-2 rounded px-1.5 py-1 text-sm transition-colors hover:bg-gray-800"
  >
    <StatusDot session={session} />
    <span className={`min-w-0 truncate ${session.attached ? 'text-gray-200' : 'text-gray-500'}`}>
      {session.name}
    </span>
    {session.model && (
      <span className="shrink-0 rounded bg-indigo-950 px-1 text-[10px] text-indigo-300">
        {session.model}
      </span>
    )}
    {session.planMode && (
      <span className="shrink-0 rounded bg-amber-950 px-1 text-[10px] text-amber-300">plan</span>
    )}
    <span className="ml-auto shrink-0 text-xs text-gray-600">
      {relativeTime(session.lastActiveAt)}
    </span>
  </a>
)

const WorkerCard = ({
  worker,
  crumb,
  sessions,
}: {
  worker: OpsWorker
  crumb: string
  sessions: OpsSession[]
}) => (
  <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
    <div className="mb-1 truncate text-xs text-gray-500">{crumb}</div>
    <div className="mb-3 flex items-center gap-2">
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${worker.alive ? 'bg-emerald-500' : 'bg-gray-700'}`}
      />
      <span className="truncate font-medium text-gray-100">{worker.name}</span>
      <span className="ml-auto truncate text-xs text-gray-600">{worker.hostname}</span>
    </div>
    {sessions.length === 0 ? (
      <div className="py-2 text-sm text-gray-700">no sessions</div>
    ) : (
      <div className="flex flex-col">
        {sessions.slice(0, MAX_ROWS).map(s => (
          <SessionRow key={s.id} session={s} />
        ))}
        {sessions.length > MAX_ROWS && (
          <div className="px-1.5 pt-1 text-xs text-gray-600">
            +{sessions.length - MAX_ROWS} more
          </div>
        )}
      </div>
    )}
  </div>
)

// Admin ops board (大屏): every worker across all workspaces with its sessions
// and live status, dark full-bleed, polling every 5s. The server enforces
// admin (403) — this page just renders the refusal.
export const OpsPage = () => {
  const api = useApi()
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    const tick = () => {
      api.admin
        .overview()
        .then(d => {
          if (!alive) return
          setData(d)
          setError(null)
          setUpdatedAt(Date.now())
        })
        .catch((e: unknown) => {
          // Keep the last snapshot on transient errors; surface the message.
          if (alive) setError(e instanceof Error ? e.message : String(e))
        })
    }
    tick()
    const t = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api])

  const grouped = useMemo(() => {
    if (!data) return null
    const projects = new Map(data.projects.map(p => [p.id, p]))
    const workspaces = new Map(data.workspaces.map(w => [w.id, w]))
    const byWorker = new Map<number, OpsSession[]>()
    for (const s of [...data.sessions].sort(sessionOrder)) {
      const list = byWorker.get(s.workerId) ?? []
      list.push(s)
      byWorker.set(s.workerId, list)
    }
    const sessionsOf = (w: OpsWorker) => byWorker.get(w.id) ?? []
    const crumb = (w: OpsWorker) => {
      const p = projects.get(w.projectId)
      const ws = p && workspaces.get(p.workspaceId)
      return [ws?.name, p?.name].filter(Boolean).join(' / ') || `project #${w.projectId}`
    }
    const workers = [...data.workers].sort(workerOrder(sessionsOf))
    return { workers, sessionsOf, crumb }
  }, [data])

  const forbidden = error?.includes('403') ?? false
  const stats = data && {
    aliveWorkers: data.workers.filter(w => w.alive).length,
    attached: data.sessions.filter(s => s.attached).length,
    busy: data.sessions.filter(s => s.busy).length,
  }

  return (
    <div className="min-h-screen bg-gray-950 px-6 py-5 text-gray-200">
      <div className="mb-5 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-lg font-semibold text-gray-100">baton · 运行大屏</h1>
        {stats && (
          <span className="text-sm text-gray-500">
            worker 在线 <span className="text-emerald-400">{stats.aliveWorkers}</span>/
            {data?.workers.length} · 已连接 session{' '}
            <span className="text-gray-300">{stats.attached}</span> · 运行中{' '}
            <span className="text-amber-400">{stats.busy}</span>
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-gray-600">
          {updatedAt && <span>更新于 {new Date(updatedAt).toLocaleTimeString('zh-CN')}</span>}
          <Link to="/" className="text-gray-500 underline-offset-2 hover:text-gray-300">
            返回
          </Link>
        </span>
      </div>
      {forbidden ? (
        <div className="grid h-[60vh] place-items-center text-gray-500">需要管理员权限</div>
      ) : (
        <>
          {error && !forbidden && (
            <div className="mb-3 text-xs text-red-400">数据刷新失败（保留上次快照）：{error}</div>
          )}
          {grouped && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {grouped.workers.map(w => (
                <WorkerCard
                  key={w.id}
                  worker={w}
                  crumb={grouped.crumb(w)}
                  sessions={grouped.sessionsOf(w)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
