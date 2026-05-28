import type { Assignment, AssignmentStatus, Code, Id } from '@baton/shared'
import { useEffect, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useAsync } from '../../hooks/use-async'

// Live list of assignments; polls every `pollMs`. Flat status / sessionId
// args so the effect deps stay primitive (filter object identity would churn
// each render). statusJoined collapses the array to a stable string key.
export const useAssignments = (
  projectId: Id | null,
  options: { status?: AssignmentStatus[]; sessionId?: Id; pollMs?: number } = {},
): { data: Assignment[] | null } => {
  const api = useApi()
  const [data, setData] = useState<Assignment[] | null>(null)
  const alive = useRef(true)
  const statusJoined = options.status?.join(',') ?? ''
  const sessionId = options.sessionId
  const pollMs = options.pollMs ?? 2000
  useEffect(() => {
    alive.current = true
    if (projectId === null) {
      setData(null)
      return () => {
        alive.current = false
      }
    }
    const status = statusJoined ? (statusJoined.split(',') as AssignmentStatus[]) : undefined
    const tick = () => {
      api.assignments
        .listByProject(projectId, { status, sessionId })
        .then(d => alive.current && setData(d))
        .catch(() => {})
    }
    tick()
    const t = setInterval(tick, pollMs)
    return () => {
      alive.current = false
      clearInterval(t)
    }
  }, [api, projectId, pollMs, statusJoined, sessionId])
  return { data }
}

export const useAssignmentByCode = (projectId: Id | null, code: Code | null) => {
  const api = useApi()
  const key = projectId !== null && code ? `${projectId}/${code}` : null
  return useAsync<Assignment | null>(
    () =>
      projectId !== null && code
        ? api.assignments.getByCode(projectId, code)
        : Promise.resolve(null),
    key,
  )
}
