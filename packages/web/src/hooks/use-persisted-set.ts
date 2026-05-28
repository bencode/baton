import { useCallback, useEffect, useState } from 'react'

const load = (key: string): Set<string> => {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

export type PersistedSet = {
  has: (id: string) => boolean
  toggle: (id: string) => void
}

// Persists a Set<string> under `key` in localStorage. toggle replaces the set
// with a fresh instance so React sees a new reference; the JSON shape is just
// an array of strings.
export const usePersistedSet = (key: string): PersistedSet => {
  const [set, setSet] = useState<Set<string>>(() => load(key))
  useEffect(() => {
    localStorage.setItem(key, JSON.stringify([...set]))
  }, [key, set])
  const has = (id: string) => set.has(id)
  const toggle = useCallback((id: string) => {
    setSet(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])
  return { has, toggle }
}
