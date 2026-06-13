import type { AdminOverview } from '@baton/shared'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { eventsToPreview, type PreviewLine } from './ops-preview'
import { type OpsSession, SessionCard } from './session-card'

const POLL_MS = 5000
const PREVIEW_CAP = 16 // transcript fetches per tick — busy sessions win the slots

type OpsWorker = AdminOverview['workers'][number]

// One wall section = one project: its workers' health in the header, its
// attached sessions as cards (working first, then most recently active).
type Section = {
  key: number
  title: string
  workers: OpsWorker[]
  cards: OpsSession[]
  dormant: number
}

const sessionOrder = (a: OpsSession, b: OpsSession): number =>
  Number(b.busy) - Number(a.busy) || b.lastActiveAt - a.lastActiveAt

const toSections = (data: AdminOverview): Section[] => {
  const workspaces = new Map(data.workspaces.map(w => [w.id, w]))
  return data.projects
    .map(p => {
      const workers = data.workers.filter(w => w.projectId === p.id)
      const sessions = data.sessions.filter(s => s.projectId === p.id)
      const ws = workspaces.get(p.workspaceId)
      return {
        key: p.id,
        title: `${ws ? `${ws.name} / ` : ''}${p.name}`.toUpperCase(),
        workers,
        cards: sessions.filter(s => s.attached).sort(sessionOrder),
        dormant: sessions.filter(s => !s.attached).length,
      }
    })
    .filter(s => s.workers.length > 0)
    .sort(
      (a, b) =>
        b.cards.filter(c => c.busy).length - a.cards.filter(c => c.busy).length ||
        b.cards.length - a.cards.length ||
        a.key - b.key,
    )
}

// Poll the fleet overview; on transient errors keep the last snapshot.
const useOverview = () => {
  const api = useApi()
  const [data, setData] = useState<AdminOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const tick = () =>
      api.admin
        .overview()
        .then(d => {
          if (!alive) return
          setData(d)
          setError(null)
          setUpdatedAt(Date.now())
        })
        .catch((e: unknown) => {
          if (alive) setError(e instanceof Error ? e.message : String(e))
        })
    tick()
    const t = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api])
  return { data, error, updatedAt }
}

// Poll transcript tails for the attached sessions (busy first, capped). A
// failed fetch keeps that card's previous preview — the wall never blanks.
const usePreviews = (sessions: OpsSession[] | undefined) => {
  const api = useApi()
  const [previews, setPreviews] = useState<Map<number, PreviewLine[]>>(new Map())
  const ids = useMemo(
    () =>
      (sessions ?? [])
        .filter(s => s.attached)
        .sort(sessionOrder)
        .slice(0, PREVIEW_CAP)
        .map(s => s.id),
    [sessions],
  )
  const idsKey = ids.join(',')
  // biome-ignore lint/correctness/useExhaustiveDependencies: `ids` gets a new identity on every poll; `idsKey` tracks actual membership changes
  useEffect(() => {
    if (ids.length === 0) return
    let alive = true
    const tick = () =>
      void Promise.all(
        ids.map(id =>
          api.sessions
            .listEvents(id, { limit: 25 })
            .then(events => [id, eventsToPreview(events)] as const)
            .catch(() => null),
        ),
      ).then(results => {
        if (!alive) return
        setPreviews(prev => {
          const next = new Map(prev)
          for (const r of results) if (r) next.set(r[0], r[1])
          return next
        })
      })
    tick()
    const t = setInterval(tick, POLL_MS)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [api, idsKey])
  return previews
}

export const OpsPage = () => {
  const { data, error, updatedAt } = useOverview()
  const previews = usePreviews(data?.sessions)
  const sections = useMemo(() => (data ? toSections(data) : []), [data])
  const workerName = useMemo(() => new Map((data?.workers ?? []).map(w => [w.id, w.name])), [data])

  const forbidden = error?.includes('403') ?? false
  const busy = data?.sessions.filter(s => s.busy).length ?? 0
  const idle = (data?.sessions.filter(s => s.attached).length ?? 0) - busy
  // `connected` = this worker's daemon is streaming now (per-worker), unlike
  // `alive` which is the shared machineId heartbeat. The board reports the
  // per-worker truth so a registered-but-not-running worker reads as offline.
  const offline = data?.workers.filter(w => !w.connected).length ?? 0

  return (
    <div className="min-h-screen bg-black px-6 py-5 font-mono text-gray-300">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-base font-bold tracking-wide text-white">⬢ BATON MISSION CONTROL</h1>
        {data && (
          <span className="text-sm text-gray-500">
            <span className="text-violet-400">● {busy} working</span> · {idle} idle ·{' '}
            {offline > 0 ? (
              <span className="text-red-400/80">{offline} worker offline</span>
            ) : (
              'all workers alive'
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-gray-600">
          {updatedAt && <span>{new Date(updatedAt).toLocaleTimeString('zh-CN')} ↻</span>}
          <Link to="/" className="text-gray-600 underline-offset-2 hover:text-gray-300">
            返回
          </Link>
        </span>
      </div>

      {forbidden ? (
        <div className="grid h-[60vh] place-items-center text-gray-600">需要管理员权限</div>
      ) : (
        <>
          {error && !forbidden && (
            <div className="mb-3 text-xs text-red-400/80">
              refresh failed (showing last snapshot): {error}
            </div>
          )}
          {sections.map(sec => (
            <section key={sec.key} className="mb-8">
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <h2 className="text-xs tracking-[0.35em] text-gray-600">{sec.title}</h2>
                <span className="flex items-center gap-3 text-[10px] text-gray-600">
                  {sec.workers.map(w => (
                    <span key={w.id} className="flex items-center gap-1">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${w.connected ? 'bg-emerald-500' : 'bg-gray-700'}`}
                      />
                      {w.name}
                    </span>
                  ))}
                  {sec.dormant > 0 && <span>+{sec.dormant} dormant</span>}
                </span>
              </div>
              {sec.cards.length === 0 ? (
                <div className="text-xs text-gray-700">all quiet</div>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                  {sec.cards.map(s => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      workerName={workerName.get(s.workerId) ?? `W-${s.workerId}`}
                      preview={previews.get(s.id)}
                    />
                  ))}
                </div>
              )}
            </section>
          ))}
        </>
      )}
    </div>
  )
}
