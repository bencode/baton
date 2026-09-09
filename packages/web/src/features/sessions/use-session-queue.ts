import type { Id, SessionQueueSnapshot } from '@baton/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'

export const useSessionQueue = (
  sessionId: Id | null,
  revision: number,
  connectionRevision: number,
) => {
  const api = useApi()
  const bound = useRef({ id: sessionId, revision: -1, connectionRevision: -1 })
  const [queue, setQueue] = useState<SessionQueueSnapshot>({ revision: -1, items: [] })
  const [error, setError] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<ReadonlySet<Id>>(new Set())
  const applySnapshot = useCallback(
    (snapshot: SessionQueueSnapshot) => {
      if (bound.current.id !== sessionId || snapshot.revision < bound.current.revision) return
      bound.current.revision = snapshot.revision
      setQueue(snapshot)
    },
    [sessionId],
  )
  useEffect(() => {
    bound.current = { id: sessionId, revision: -1, connectionRevision: -1 }
    setQueue({ revision: -1, items: [] })
    setError(null)
    setCancelling(new Set())
  }, [sessionId])
  useEffect(() => {
    if (sessionId === null) return
    if (
      bound.current.revision >= Math.max(revision, 0) &&
      bound.current.connectionRevision === connectionRevision
    )
      return
    let alive = true
    void api.sessions
      .listQueue(sessionId)
      .then(snapshot => {
        if (alive) {
          bound.current.connectionRevision = connectionRevision
          applySnapshot(snapshot)
          setError(null)
        }
      })
      .catch(cause => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause))
      })
    return () => {
      alive = false
    }
  }, [api, sessionId, revision, connectionRevision, applySnapshot])
  const cancel = useCallback(
    async (inputId: Id) => {
      if (sessionId === null) return
      setCancelling(current => new Set(current).add(inputId))
      setError(null)
      try {
        const result = await api.sessions.cancelInput(sessionId, inputId)
        if (bound.current.id !== sessionId) return
        applySnapshot(result.queue)
        if (!result.removed)
          setError('Input is no longer queued — it may have started or already been removed')
      } catch (cause) {
        if (bound.current.id === sessionId)
          setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (bound.current.id === sessionId)
          setCancelling(current => new Set([...current].filter(id => id !== inputId)))
      }
    },
    [api, sessionId, applySnapshot],
  )
  return {
    items: bound.current.id === sessionId ? queue.items : [],
    applySnapshot,
    error,
    cancelling,
    cancel,
  }
}
