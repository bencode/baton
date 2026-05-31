import type { RefObject } from 'react'
import type { RenderItem } from '../event-render'
import { RenderItemView } from './render-item'

type EventStreamProps = { items: RenderItem[]; scrollRef: RefObject<HTMLDivElement | null> }

export const EventStream = ({ items, scrollRef }: EventStreamProps) => (
  <div ref={scrollRef} className="flex-1 overflow-auto bg-white px-6 py-4">
    {items.length === 0 ? (
      <p className="text-sm text-gray-400">no events yet — say something below.</p>
    ) : (
      <div className="mx-auto flex max-w-5xl flex-col gap-3">
        {items.map(item => (
          <RenderItemView key={item.key} item={item} />
        ))}
      </div>
    )}
  </div>
)
