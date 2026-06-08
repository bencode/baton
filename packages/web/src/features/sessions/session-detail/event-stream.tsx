import type { RefObject, UIEventHandler } from 'react'
import type { RenderItem } from '../event-render'
import { ActivityGroupView } from './activity-group'
import { groupRenderItems } from './group-items'
import { RenderItemView } from './render-item'

type EventStreamProps = {
  items: RenderItem[]
  scrollRef: RefObject<HTMLDivElement | null>
  // Marks the trailing activity group as live (expanded) while a turn runs.
  working?: boolean
  onScroll?: UIEventHandler<HTMLDivElement>
  // Pinned to the bottom — when false (and there are events) the jump button shows.
  pinned?: boolean
  onJumpToBottom?: () => void
}

export const EventStream = ({
  items,
  scrollRef,
  working = false,
  onScroll,
  pinned = true,
  onJumpToBottom,
}: EventStreamProps) => (
  // `relative` wrapper so the jump button anchors to the viewport, not the
  // scrolled content; the inner div is the actual scroll container.
  <div className="relative min-w-0 flex-1 overflow-hidden">
    <div
      ref={scrollRef}
      onScroll={onScroll}
      className="h-full overflow-auto bg-white px-3 py-4 sm:px-6"
    >
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">no events yet — say something below.</p>
      ) : (
        <div className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-3">
          {groupRenderItems(items, working).map(item =>
            item.kind === 'activity-group' ? (
              <ActivityGroupView key={item.key} group={item} />
            ) : (
              <RenderItemView key={item.key} item={item} />
            ),
          )}
        </div>
      )}
    </div>
    {!pinned && items.length > 0 && (
      <button
        type="button"
        onClick={onJumpToBottom}
        className="absolute right-4 bottom-4 z-10 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-gray-600 text-xs shadow-md hover:bg-gray-50"
      >
        ↓ 最新消息
      </button>
    )}
  </div>
)
