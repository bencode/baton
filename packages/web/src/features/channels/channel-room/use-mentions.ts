import type { ChannelMember } from '@baton/shared'
import { type KeyboardEvent, type RefObject, useState } from 'react'

// The @-token under the caret (word starting with @), used to filter the list;
// null when the caret isn't in a mention.
const mentionQuery = (text: string, caret: number): string | null =>
  text.slice(0, caret).match(/@([^\s@]*)$/)?.[1] ?? null

// @-mention autocomplete for the channel composer — the open/highlight state and
// keyboard, mirroring useSlashCommands. The composer renders the menu (suggestions
// + activeIndex) and delegates keydown: onKeyDown returns true when it consumed
// the event (menu nav / pick / close) so the composer skips its send/newline. The
// highlight resets on text change (resetIndex), not on caret moves — so arrow keys
// navigate the menu instead of resetting it.
export const useMentions = (
  text: string,
  setText: (v: string) => void,
  ref: RefObject<HTMLTextAreaElement | null>,
  members: ChannelMember[],
  me: string,
) => {
  const [query, setQuery] = useState<string | null>(null)
  const [index, setIndex] = useState(0)

  const suggestions =
    query === null
      ? []
      : members
          .filter(m => m.name !== me && m.name.toLowerCase().startsWith(query.toLowerCase()))
          .slice(0, 6)
  const open = suggestions.length > 0
  const activeIndex = open ? Math.min(index, suggestions.length - 1) : 0

  // Recompute the query from the caret (on keyup/click). Leaves the highlight
  // alone — it only resets on text change (resetIndex).
  const sync = (): void => {
    const el = ref.current
    if (el) setQuery(mentionQuery(el.value, el.selectionStart))
  }
  const resetIndex = (): void => setIndex(0)

  const pick = (name: string): void => {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart
    // Replace the whole @token straddling the caret — its head ends at the caret,
    // its tail may run past it (the caret can sit mid-token after an arrow-left).
    const head = text.slice(0, caret).match(/@[^\s@]*$/)
    if (!head) return
    const start = caret - head[0].length
    const tail = text.slice(caret).match(/^[^\s@]*/)?.[0] ?? ''
    const before = `${text.slice(0, start)}@${name} `
    setText(before + text.slice(caret + tail.length))
    setQuery(null)
    setIndex(0)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(before.length, before.length)
    })
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIndex(i => (i + 1) % suggestions.length)
      return true
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setIndex(i => (i - 1 + suggestions.length) % suggestions.length)
      return true
    }
    if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey) {
      e.preventDefault()
      const m = suggestions[activeIndex]
      if (m) pick(m.name)
      return true
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setQuery(null)
      setIndex(0)
      return true
    }
    return false
  }

  return { suggestions, activeIndex, open, sync, pick, resetIndex, setIndex, onKeyDown }
}
