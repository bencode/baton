import type { ChannelMessage } from '@baton/shared'
import { useEffect, useRef } from 'react'
import { MessageItem } from './message-item'

// Scrollable transcript that stays pinned to the bottom unless the reader has
// scrolled up to look at history (then new messages don't yank them down).
export const MessageList = ({ messages, me }: { messages: ChannelMessage[]; me: string }) => {
  const ref = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)

  const onScroll = () => {
    const el = ref.current
    if (el) pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useEffect(() => {
    const el = ref.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
      {messages.length === 0 ? (
        <div className="grid h-full place-items-center text-sm text-gray-300">
          还没有消息，打个招呼吧。
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.map(m => (
            <MessageItem key={m.seq} msg={m} me={me} />
          ))}
        </div>
      )}
    </div>
  )
}
