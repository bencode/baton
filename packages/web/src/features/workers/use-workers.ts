import type { Id, WorkerView } from '@baton/shared'
import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useProjectRevision } from '../projects/use-project-revision'

// Workers in this project, kept fresh by the project stream (a `workers` signal
// fires on register / daemon connect-disconnect / delete), with a slow poll
// backstop. Same shape as useSessions.
export const useWorkers = (
  projectId: Id | null,
  pollMs = 15000,
): { data: WorkerView[] | null; loading: boolean; error: Error | null; refresh(): void } => {
  const api = useApi()
  const rev = useProjectRevision(projectId, 'workers')
  const [data, setData] = useState<WorkerView[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])
  // biome-ignore lint/correctness/useExhaustiveDependencies: rev is a refetch trigger, not read in the body
  useEffect(() => {
    let alive = true
    if (projectId === null) {
      setData(null)
      setLoading(false)
      return () => {
        alive = false
      }
    }
    const tick = () => {
      api.workers
        .listByProject(projectId)
        .then(d => {
          if (!alive) return
          setData(d)
          setError(null)
          setLoading(false)
        })
        .catch(e => {
          if (!alive) return
          setError(e instanceof Error ? e : new Error(String(e)))
          setLoading(false)
        })
    }
    tick()
    const t = setInterval(tick, pollMs)
    return () => {
      alive = false
      clearInterval(t)
    }
    // `rev` bumps on a project `workers` signal → re-run the effect → refetch.
  }, [api, projectId, pollMs, rev, revision])
  return { data, loading, error, refresh }
}
