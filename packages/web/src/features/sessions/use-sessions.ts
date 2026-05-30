import type { Id, SessionView } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

// Poll sessions in this project; refresh every `pollMs`. Errors surface as
// `error` and keep last-known data so transient blips don't blank the panel.
export const useSessions = (
  projectId: Id | null,
  pollMs = 2000,
): { data: SessionView[] | null; loading: boolean; error: Error | null } => {
  const api = useApi()
  const [data, setData] = useState<SessionView[] | null>(null)
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
  }, [api, projectId, pollMs])
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
