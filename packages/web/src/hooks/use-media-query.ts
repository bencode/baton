import { useCallback, useSyncExternalStore } from 'react'

// Subscribe to a CSS media query. useSyncExternalStore keeps it concurrent-safe
// with no effect and no extra render; getServerSnapshot returns false so the
// first client frame matches the desktop layout and the drawer never flashes
// before the real match settles. subscribe/getSnapshot are memoized on `query`
// so a stable query doesn't resubscribe every render.
export const useMediaQuery = (query: string): boolean => {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', onChange)
      return () => mql.removeEventListener('change', onChange)
    },
    [query],
  )
  const getSnapshot = useCallback(() => window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}

// Phone-width breakpoint, paired with Tailwind's md (768px): below it the shell
// drops its resizable two-pane split for a single column plus a slide-in drawer.
export const useIsMobile = (): boolean => useMediaQuery('(max-width: 767px)')
