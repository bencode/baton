import { type RefObject, useEffect, useRef } from 'react'

// Close an open overlay on outside mousedown or Escape — the shared dismiss
// behavior behind the header menus (user / project), the channel invite popover,
// and the loops control. No-op while `open` is false. `onClose` is held in a ref
// so callers can pass an inline closure without re-subscribing the listeners every
// render; the effect only re-runs when `open` flips.
export const useDismiss = (
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
): void => {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open])
}
