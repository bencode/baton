import { type RefObject, useLayoutEffect } from 'react'

// Grow a textarea with its content from its CSS min-height up to maxPx, then let
// it scroll internally. Re-runs whenever `value` changes, so clearing the draft
// after send snaps it back to the minimum.
export const useAutosize = (
  ref: RefObject<HTMLTextAreaElement | null>,
  value: string,
  maxPx = 192,
) => {
  // biome-ignore lint/correctness/useExhaustiveDependencies: `value` is an intentional trigger — the effect reads the DOM, not the prop
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, maxPx)}px`
  }, [ref, value, maxPx])
}
