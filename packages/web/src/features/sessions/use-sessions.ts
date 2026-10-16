import type { Id, SessionView } from '@baton/shared'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useApi } from '../../app/api-context'
import { type AsyncState, useAsync } from '../../hooks/use-async'
import { useProjectRevision } from '../projects/use-project-revision'

// Sessions in this project, kept fresh by the project stream: a `sessions`
// signal triggers an immediate refetch, and a slow poll backstops a dropped
// stream. Errors surface as `error` and keep last-known data so transient blips
// don't blank the panel.
export const useSessions = (
  projectId: Id | null,
  pollMs = 15000,
): { data: SessionView[] | null; loading: boolean; error: Error | null; refresh(): void } => {
  const api = useApi()
  const rev = useProjectRevision(projectId, 'sessions')
  const [data, setData] = useState<SessionView[] | null>(null)
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
      api.sessions
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
    // `rev` bumps on a project `sessions` signal → re-run the effect → refetch.
  }, [api, projectId, pollMs, rev, revision])
  return { data, loading, error, refresh }
}

// Session lookup by int id (no more S- codes). Returns null while loading or
// when sessionId is null.
export const useSession = (
  sessionId: Id | null,
): AsyncState<SessionView | null> & { refresh(): void } => {
  const api = useApi()
  const [attempt, setAttempt] = useState(0)
  const key = useMemo(() => ({ sessionId, attempt }), [sessionId, attempt])
  const refresh = useCallback(() => setAttempt(value => value + 1), [])
  const state = useAsync<SessionView | null>(
    () => (sessionId !== null ? api.sessions.get(sessionId) : Promise.resolve(null)),
    key,
  )
  return { ...state, refresh }
}
