import type { Id, SessionView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'
import { useProjectRevision } from '../projects/use-project-revision'

// Sessions in this project, kept fresh by the project stream: a `sessions`
// signal triggers an immediate refetch, and a slow poll backstops a dropped
// stream. Errors surface as `error` and keep last-known data so transient blips
// don't blank the panel.
export const useSessions = (
  projectId: Id | null,
  pollMs = 15000,
): { data: SessionView[] | null; loading: boolean; error: Error | null } => {
  const api = useApi()
  const rev = useProjectRevision(projectId, 'sessions')
  const [data, setData] = useState<SessionView[] | null>(null)
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
      api.sessions
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
    // `rev` bumps on a project `sessions` signal → re-run the effect → refetch.
  }, [api, projectId, pollMs, rev])
  return { data, loading, error }
}

// Session lookup by int id (no more S- codes). Returns null while loading or
// when sessionId is null.
export const useSession = (sessionId: Id | null) => {
  const api = useApi()
  return useAsync<SessionView | null>(
    () => (sessionId !== null ? api.sessions.get(sessionId) : Promise.resolve(null)),
    sessionId,
  )
}
