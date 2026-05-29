import type { Id, WorkerView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'

// Poll workers in this project. Same shape as useSessions — server-side alive
// flips quickly when a daemon stops heartbeating, so 2s cadence is fine.
export const useWorkers = (
  projectId: Id | null,
  pollMs = 2000,
): { data: WorkerView[] | null; loading: boolean; error: Error | null } => {
  const api = useApi()
  const [data, setData] = useState<WorkerView[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    if (projectId === null) {
      setData(null)
      setLoading(false)
      return () => {
        alive.current = false
      }
    }
    const tick = () => {
      api.workers
        .listByProject(projectId)
        .then(d => {
          if (!alive.current) return
          setData(d)
          setError(null)
          setLoading(false)
        })
        .catch(e => {
          if (!alive.current) return
          setError(e instanceof Error ? e : new Error(String(e)))
          setLoading(false)
        })
    }
    tick()
    const t = setInterval(tick, pollMs)
    return () => {
      alive.current = false
      clearInterval(t)
    }
  }, [api, projectId, pollMs])
  return { data, loading, error }
}
