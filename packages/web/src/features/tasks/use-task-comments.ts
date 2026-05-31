import type { Id, TaskComment } from '@baton/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useProjectRevision } from '../projects/use-project-revision'

// Append-only comments for a task, kept fresh by the project `tasks` stream
// signal (a new comment bumps it) with a slow poll backstop. `add` posts a
// comment then nudges a local refetch so the author sees it immediately.
export const useTaskComments = (
  projectId: Id | null,
  taskId: Id | null,
  pollMs = 15000,
): {
  data: TaskComment[] | null
  loading: boolean
  error: Error | null
  add: (body: string) => Promise<void>
} => {
  const api = useApi()
  const rev = useProjectRevision(projectId, 'tasks')
  const [data, setData] = useState<TaskComment[] | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [localRev, setLocalRev] = useState(0)
  const alive = useRef(true)

  // biome-ignore lint/correctness/useExhaustiveDependencies: rev/localRev are refetch triggers, not read in the body
  useEffect(() => {
    alive.current = true
    if (taskId === null) {
      setData(null)
      setLoading(false)
      return () => {
        alive.current = false
      }
    }
    const tick = () => {
      api.tasks
        .listComments(taskId)
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
  }, [api, taskId, pollMs, rev, localRev])

  const add = useCallback(
    async (body: string): Promise<void> => {
      if (taskId === null) return
      await api.tasks.addComment(taskId, body)
      setLocalRev(r => r + 1)
    },
    [api, taskId],
  )

  return { data, loading, error, add }
}
