import type { Id, ServicePresence } from '@baton/shared'
import { useCallback, useEffect, useState } from 'react'
import { useApi } from '../../app/api-context'

type ServicesState = {
  data: ServicePresence[] | null
  loading: boolean
  error: Error | null
  refresh: () => void
}

export const useServices = (projectId: Id, pollMs = 5000): ServicesState => {
  const api = useApi()
  const [data, setData] = useState<ServicePresence[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision(value => value + 1), [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: revision is an explicit refetch trigger
  useEffect(() => {
    let alive = true
    const load = () => {
      api.services
        .listByProject(projectId)
        .then(services => {
          if (!alive) return
          setData(services)
          setError(null)
          setLoading(false)
        })
        .catch(cause => {
          if (!alive) return
          setError(cause instanceof Error ? cause : new Error(String(cause)))
          setLoading(false)
        })
    }
    load()
    const timer = setInterval(load, pollMs)
    return () => {
      alive = false
      clearInterval(timer)
    }
  }, [api, pollMs, projectId, revision])

  return { data, loading, error, refresh }
}
