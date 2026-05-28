import type { Code, Id, Session } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

// Poll sessions in this project; refresh every `pollMs`. Errors surface as
// `error` and keep last-known data so transient blips don't blank the panel.
export const useSessions = (
  projectId: Id | null,
  pollMs = 2000,
): { data: Session[] | null; loading: boolean; error: Error | null } => {
  const api = useApi()
  const [data, setData] = useState<Session[] | null>(null)
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

export const useSessionByCode = (projectId: Id | null, code: Code | null) => {
  const api = useApi()
  const key = projectId !== null && code ? `${projectId}/${code}` : null
  return useAsync<Session | null>(
    () =>
      projectId !== null && code ? api.sessions.getByCode(projectId, code) : Promise.resolve(null),
    key,
  )
}
