import { useCallback, useMemo, useState } from 'react'

export type TreeToggles = {
  isOpen(key: string, defaultOpen: boolean): boolean
  toggle(key: string): void
}

// Expansion state of the files tree, in memory only. Each node has a default; the
// set records the nodes the user flipped away from it.
export const useTreeToggles = (): TreeToggles => {
  const [flipped, setFlipped] = useState<ReadonlySet<string>>(() => new Set())
  const isOpen = useCallback(
    (key: string, defaultOpen: boolean) => defaultOpen !== flipped.has(key),
    [flipped],
  )
  const toggle = useCallback((key: string) => {
    setFlipped(previous => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  return useMemo(() => ({ isOpen, toggle }), [isOpen, toggle])
}
