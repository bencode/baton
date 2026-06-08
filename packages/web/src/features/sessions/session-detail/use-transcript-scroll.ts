import type { Id } from '@baton/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { atBottom } from './stick-to-bottom'

// All transcript scroll behavior in one place: stay pinned to the latest message
// as events stream in, but never yank the view when the user has scrolled up; and
// hold the reading position when older events are prepended ("load earlier").
// `stick`/`prependFrom` are refs (no re-render on the frequent scroll handler);
// `pinned` mirrors stick for the jump-to-latest button and flips only on a cross.
export type TranscriptScroll = {
  scrollRef: React.RefObject<HTMLDivElement | null>
  pinned: boolean
  onScroll: () => void
  jumpToBottom: () => void
  // Call right before fetching an older page so the layout effect can restore
  // the reading position once the batch renders (otherwise the view jumps).
  markPrepend: () => void
}

export const useTranscriptScroll = (sessionId: Id | null, itemCount: number): TranscriptScroll => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stick = useRef(true)
  const [pinned, setPinned] = useState(true)
  const prependFrom = useRef<number | null>(null)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const next = atBottom(el.scrollHeight, el.scrollTop, el.clientHeight)
    stick.current = next
    setPinned(prev => (prev === next ? prev : next))
  }, [])

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    stick.current = true
    setPinned(true)
  }, [])

  const markPrepend = useCallback(() => {
    prependFrom.current = scrollRef.current?.scrollHeight ?? null
  }, [])

  // A newly opened session starts pinned to its latest message.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on session switch only
  useEffect(() => {
    stick.current = true
    setPinned(true)
  }, [sessionId])

  // After items change: restore position if older events were just prepended,
  // else keep the bottom pinned. Layout effect runs pre-paint → no flicker.
  // biome-ignore lint/correctness/useExhaustiveDependencies: itemCount is the intended trigger
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (prependFrom.current !== null) {
      el.scrollTop += el.scrollHeight - prependFrom.current
      prependFrom.current = null
      return
    }
    if (stick.current) el.scrollTop = el.scrollHeight
  }, [itemCount])

  return { scrollRef, pinned, onScroll, jumpToBottom, markPrepend }
}
