import { useEffect, useState } from 'react'

export type AsyncState<T> = { data: T | null; loading: boolean; error: Error | null }

// Runs `load` whenever `key` changes (callers pass the id the fetch depends on,
// or a constant for one-shot fetches). `load` is recreated each render and is
// deliberately not a dependency — `key` is the re-run trigger.
export const useAsync = <T>(load: () => Promise<T>, key: unknown): AsyncState<T> => {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  // biome-ignore lint/correctness/useExhaustiveDependencies: key is the intended trigger; load is recreated each render
  useEffect(() => {
    let alive = true
    setState(s => ({ ...s, loading: true, error: null }))
    load()
      .then(data => alive && setState({ data, loading: false, error: null }))
      .catch(error => alive && setState({ data: null, loading: false, error }))
    return () => {
      alive = false
    }
  }, [key])
  return state
}
