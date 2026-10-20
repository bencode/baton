import { useCallback, useEffect, useState } from 'react'

export type FileQueryState<T> = {
  data: T | null
  error: Error | null
  loading: boolean
  reload(): void
}

type Loaded<T> = { key: string; token: string; data: T | null; error: Error | null }

// Loads once per key, for components that stay mounted while hidden: open tabs and
// the sidebar live inside <Activity>, which re-runs effects every time they are shown.
// A hidden component never runs the effect, so it never fetches; showing it again
// with an already-loaded token does not refetch. reload() and a changed refreshKey
// refetch while keeping the current data; a new key starts empty. Cleanup aborts the
// in-flight request and discards its result.
export const useFileQuery = <T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  refreshKey = 0,
): FileQueryState<T> => {
  const [revision, setRevision] = useState(0)
  const [loaded, setLoaded] = useState<Loaded<T> | null>(null)
  const token = key === null ? null : `${key}#${refreshKey}#${revision}`

  // biome-ignore lint/correctness/useExhaustiveDependencies: token encodes key and both refresh triggers; load is recreated each render
  useEffect(() => {
    if (key === null || token === null || loaded?.token === token) return
    const controller = new AbortController()
    load(controller.signal).then(
      data => {
        if (!controller.signal.aborted) setLoaded({ key, token, data, error: null })
      },
      (cause: unknown) => {
        if (controller.signal.aborted) return
        const error = cause instanceof Error ? cause : new Error(String(cause))
        setLoaded({ key, token, data: null, error })
      },
    )
    return () => controller.abort()
  }, [token])

  const reload = useCallback(() => setRevision(value => value + 1), [])
  const current = loaded?.key === key ? loaded : null
  return {
    data: current?.data ?? null,
    error: current?.token === token ? current.error : null,
    loading: token !== null && current?.token !== token,
    reload,
  }
}
