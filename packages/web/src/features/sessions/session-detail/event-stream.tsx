import type { RefObject, UIEventHandler } from 'react'
import { ChatIcon, ChevronDownIcon } from '../../../components/icons'
import type { RenderItem } from '../event-render'
import { ActivityGroupView } from './activity-group'
import { groupRenderItems } from './group-items'
import { RenderItemView } from './render-item'

type EventStreamProps = {
  items: readonly RenderItem[]
  scrollRef: RefObject<HTMLDivElement | null>
  // Marks the trailing activity group as live (expanded) while a turn runs.
  working?: boolean
  statusKnown?: boolean
  onContentLoad?: () => void
  onScroll?: UIEventHandler<HTMLDivElement>
  // Pinned to the bottom — when false (and there are events) the jump button shows.
  pinned?: boolean
  onJumpToBottom?: () => void
  // Older history exists above the loaded window — show a "load earlier" button.
  hasOlder?: boolean
  loadingOlder?: boolean
  onLoadOlder?: () => void
}

export const EventStream = ({
  items,
  scrollRef,
  working = false,
  statusKnown = true,
  onContentLoad,
  onScroll,
  pinned = true,
  onJumpToBottom,
  hasOlder = false,
  loadingOlder = false,
  onLoadOlder,
}: EventStreamProps) => (
  // `relative` wrapper so the jump button anchors to the viewport, not the
  // scrolled content; the inner div is the actual scroll container.
  <div className="relative min-w-0 flex-1 overflow-hidden">
    <section
      ref={scrollRef}
      onScroll={onScroll}
      onLoadCapture={onContentLoad}
      aria-label="会话记录"
      className="chat-scroll"
    >
      {items.length === 0 ? (
        <div className="chat-empty">
          <ChatIcon />
          <h2>从一条消息开始</h2>
          <p>描述你的问题，或说说接下来想完成什么。</p>
        </div>
      ) : (
        <div className="chat-transcript">
          {hasOlder && (
            <div className="chat-load-earlier">
              <button
                type="button"
                onClick={onLoadOlder}
                disabled={loadingOlder}
                className="ui-quiet-button"
              >
                {loadingOlder ? '加载中…' : '加载更早的消息'}
              </button>
            </div>
          )}
          {groupRenderItems(items, working).map(item =>
            item.kind === 'activity-group' ? (
              <ActivityGroupView key={item.key} group={item} statusKnown={statusKnown} />
            ) : (
              <RenderItemView key={item.key} item={item} />
            ),
          )}
        </div>
      )}
    </section>
    {!pinned && items.length > 0 && (
      <button type="button" onClick={onJumpToBottom} className="chat-jump-latest ui-focus">
        <ChevronDownIcon />
        回到最新
      </button>
    )}
  </div>
)
