import type { ChannelMember } from '@baton/shared'
import { type KeyboardEvent, useEffect, useRef, useState } from 'react'

// Recipients = @mentions that match an online member (deduped); empty = broadcast.
const recipientsFrom = (text: string, members: ChannelMember[]): string[] => {
  const names = new Set(members.map(m => m.name))
  const hit = new Set<string>()
  for (const m of text.matchAll(/@([^\s@]+)/g)) {
    const n = m[1]
    if (n && names.has(n)) hit.add(n)
  }
  return [...hit]
}

// The @-token under the caret (word starting with @), used to filter the dropdown;
// null when the caret isn't in a mention.
const mentionQuery = (text: string, caret: number): string | null =>
  text.slice(0, caret).match(/@([^\s@]*)$/)?.[1] ?? null

// Message input. `@` pops the online roster (incl. Agents) to direct a message;
// picking a name sets `to`. Enter sends, Shift+Enter newlines, Enter completes the
// highlighted mention when the dropdown is open.
export const Composer = ({
  members,
  me,
  onSend,
}: {
  members: ChannelMember[]
  me: string
  onSend: (text: string, to: string[]) => Promise<void>
}) => {
  const [text, setText] = useState('')
  const [query, setQuery] = useState<string | null>(null)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const suggestions =
    query === null
      ? []
      : members
          .filter(m => m.name !== me && m.name.toLowerCase().startsWith(query.toLowerCase()))
          .slice(0, 6)

  const sync = () => {
    const el = ref.current
    if (el) setQuery(mentionQuery(el.value, el.selectionStart))
  }

  const pick = (name: string) => {
    const el = ref.current
    if (!el) return
    const caret = el.selectionStart
    const before = text.slice(0, caret).replace(/@([^\s@]*)$/, `@${name} `)
    setText(before + text.slice(caret))
    setQuery(null)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(before.length, before.length)
    })
  }

  const submit = () => {
    const body = text.trim()
    if (!body) return
    void onSend(body, recipientsFrom(body, members))
    setText('')
    setQuery(null)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      const first = suggestions[0]
      if (first) pick(first.name)
      else submit()
    }
  }

  return (
    <div className="relative shrink-0 border-t border-gray-200 px-4 py-2">
      {suggestions.length > 0 && (
        <div className="absolute bottom-full left-4 mb-1 w-56 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md">
          {suggestions.map(m => (
            <button
              key={m.name}
              type="button"
              onMouseDown={e => {
                e.preventDefault()
                pick(m.name)
              }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-gray-50"
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${m.kind === 'agent' ? 'bg-violet-500' : 'bg-emerald-500'}`}
              />
              {m.name}
              <span className="ml-auto text-xs text-gray-400">{m.kind}</span>
            </button>
          ))}
        </div>
      )}
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyUp={sync}
          onClick={sync}
          onKeyDown={onKeyDown}
          placeholder="说点什么… 用 @ 提到某人（含 Agent）"
          className="max-h-40 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-gray-900"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          发送
        </button>
      </div>
    </div>
  )
}
