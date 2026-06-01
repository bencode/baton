import { useSyncExternalStore } from 'react'

// A tiny global revision counter for the workspace/project lists, which fetch
// once via useAsync with no stream invalidation. After a mutation (e.g. rename)
// call bumpLists() to re-key those hooks and refetch. Folded into each hook's
// useAsync key via useListRevision().
let revision = 0
const subscribers = new Set<() => void>()

export const bumpLists = (): void => {
  revision += 1
  for (const notify of subscribers) notify()
}

const subscribe = (notify: () => void): (() => void) => {
  subscribers.add(notify)
  return () => subscribers.delete(notify)
}

export const useListRevision = (): number => useSyncExternalStore(subscribe, () => revision)
