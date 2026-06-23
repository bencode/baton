import type { Id, Loop } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useProjectRevision } from '../projects/use-project-revision'

// A session's loops, kept fresh by the project stream: a 'loops' signal (CRUD
// edits + each scheduler beat) triggers an immediate refetch, with a slow poll
// backstop for a dropped stream (mirrors useSessions). Keeps last-known data on
// a transient error so a blip doesn't blank the panel.
export const useLoops = (
  sessionId: Id | null,
  projectId: Id | null,
  pollMs = 15000,
): { data: Loop[] | null; loading: boolean; error: Error | null } => {
  const api = useApi()
  const rev = useProjectRevision(projectId, 'loops')
  const [data, setData] = useState<Loop[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const alive = useRef(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: rev is a refetch trigger, not read in the body
  useEffect(() => {
    alive.current = true
    if (sessionId === null) {
      setData(null)
      setLoading(false)
      return () => {
        alive.current = false
      }
    }
    const tick = () => {
      api.loops
        .listBySession(sessionId)
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
    // `rev` bumps on a project 'loops' signal → re-run the effect → refetch.
  }, [api, sessionId, pollMs, rev])
  return { data, loading, error }
}
