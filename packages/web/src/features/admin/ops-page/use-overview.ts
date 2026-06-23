import type { AdminOverview } from '@baton/shared'
import { useEffect, useMemo, useState } from 'react'
import { useApi } from '../../../app/api-context'
import { eventsToPreview, type PreviewLine } from '../ops-preview'
import type { OpsSession } from '../session-card'
import { sessionOrder } from './sections'

const POLL_MS = 5000
const PREVIEW_CAP = 16 // transcript fetches per tick — busy sessions win the slots

// Poll the fleet overview; on transient errors keep the last snapshot.
export const useOverview = () => {
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
export const usePreviews = (sessions: OpsSession[] | undefined) => {
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
