import type { Id } from '@baton/shared'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { RenderItem } from '../event-render'
import { atBottom } from './stick-to-bottom'

export type TranscriptScroll = {
  scrollRef: React.RefObject<HTMLDivElement | null>
  pinned: boolean
  onScroll: () => void
  jumpToBottom: () => void
  markPrepend: () => void
  onContentLoad: () => void
}

export const useTranscriptScroll = (
  sessionId: Id | null,
  items: readonly RenderItem[],
  enabled: boolean,
): TranscriptScroll => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stick = useRef(true)
  const [pinned, setPinned] = useState(true)
  const prependFrom = useRef<{ height: number; top: number } | null>(null)
  const renderedItems = useRef<readonly RenderItem[] | null>(null)
  const binding = useRef<{ sessionId: Id | null; enabled: boolean } | null>(null)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const next = atBottom(el.scrollHeight, el.scrollTop, el.clientHeight)
    stick.current = next
    setPinned(previous => (previous === next ? previous : next))
  }, [])

  const jumpToBottom = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    stick.current = true
    setPinned(true)
  }, [])

  const markPrepend = useCallback(() => {
    const el = scrollRef.current
    prependFrom.current = el ? { height: el.scrollHeight, top: el.scrollTop } : null
  }, [])

  const onContentLoad = useCallback(() => {
    const el = scrollRef.current
    if (!el || el.clientHeight === 0 || prependFrom.current) return
    if (stick.current) el.scrollTop = el.scrollHeight
    onScroll()
  }, [onScroll])

  useLayoutEffect(() => {
    const itemsChanged = renderedItems.current !== items
    renderedItems.current = items
    const previous = binding.current
    const reset = previous?.sessionId !== sessionId || !previous?.enabled
    binding.current = { sessionId, enabled }
    if (!enabled || reset) {
      prependFrom.current = null
      stick.current = true
      setPinned(true)
    }
    const el = scrollRef.current
    if (!enabled || !el || el.clientHeight === 0 || (!itemsChanged && !reset)) return
    if (prependFrom.current) {
      el.scrollTop = prependFrom.current.top + el.scrollHeight - prependFrom.current.height
      prependFrom.current = null
      onScroll()
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [sessionId, items, enabled, onScroll])

  useEffect(() => {
    const el = scrollRef.current
    if (sessionId === null || !enabled || !el) return
    const observer = new ResizeObserver(onContentLoad)
    observer.observe(el)
    return () => observer.disconnect()
  }, [sessionId, enabled, onContentLoad])

  return { scrollRef, pinned, onScroll, jumpToBottom, markPrepend, onContentLoad }
}
