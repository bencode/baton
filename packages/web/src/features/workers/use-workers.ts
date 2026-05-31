import type { Id, WorkerView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useProjectRevision } from '../projects/use-project-revision'

// Workers in this project, kept fresh by the project stream (a `workers` signal
// fires on register / daemon connect-disconnect / delete), with a slow poll
// backstop. Same shape as useSessions.
export const useWorkers = (
  projectId: Id | null,
  pollMs = 15000,
): { data: WorkerView[] | null; loading: boolean; error: Error | null } => {
  const api = useApi()
  const rev = useProjectRevision(projectId, 'workers')
  const [data, setData] = useState<WorkerView[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: rev is a refetch trigger, not read in the body
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
    // `rev` bumps on a project `workers` signal → re-run the effect → refetch.
  }, [api, projectId, pollMs, rev])
  return { data, loading, error }
}
