import { act, cleanup, render } from '@testing-library/react'
import { useCallback } from 'react'
import { afterEach, expect, test } from 'vitest'
import type { RenderItem } from '../event-render'
import { type TranscriptScroll, useTranscriptScroll } from './use-transcript-scroll'

afterEach(cleanup)
const answer = (text: string, key = 'answer'): RenderItem => ({ kind: 'assistant-text', key, text })

const setup = () => {
  const metrics = { height: 1000, top: 0, viewport: 200 }
  let state: TranscriptScroll
  const Host = ({
    items,
    sessionId = 1,
    enabled = true,
  }: {
    items: RenderItem[]
    sessionId?: number
    enabled?: boolean
  }) => {
    const scroll = useTranscriptScroll(sessionId, items, enabled)
    state = scroll
    const bind = useCallback(
      (node: HTMLDivElement | null) => {
        scroll.scrollRef.current = node
        if (node)
          Object.defineProperties(node, {
            scrollHeight: { configurable: true, get: () => metrics.height },
            clientHeight: { configurable: true, get: () => metrics.viewport },
            scrollTop: {
              configurable: true,
              get: () => metrics.top,
              set: (value: number) => {
                metrics.top = Math.max(0, Math.min(value, metrics.height - metrics.viewport))
              },
            },
          })
      },
      [scroll.scrollRef],
    )
    return <div ref={bind} />
  }
  const view = render(<Host items={[answer('初始')]} />)
  return {
    metrics,
    get state() {
      return state
    },
    update: (items: RenderItem[], sessionId = 1, enabled = true) =>
      view.rerender(<Host items={items} sessionId={sessionId} enabled={enabled} />),
  }
}

test('growth of the same item follows only while pinned', () => {
  const hook = setup()
  expect(hook.metrics.top).toBe(800)
  hook.metrics.height = 1400
  hook.update([answer('同一条持续增长')])
  expect(hook.metrics.top).toBe(1200)
  hook.metrics.top = 100
  act(() => hook.state.onScroll())
  hook.metrics.height = 1800
  hook.update([answer('继续增长')])
  expect(hook.metrics.top).toBe(100)
  expect(hook.state.pinned).toBe(false)
  act(() => hook.state.jumpToBottom())
  expect(hook.metrics.top).toBe(1600)
  expect(hook.state.pinned).toBe(true)
})

test('prepending history restores the visible position once without repinning', () => {
  const hook = setup()
  hook.metrics.top = 120
  act(() => hook.state.onScroll())
  act(() => hook.state.markPrepend())
  hook.metrics.height = 1500
  hook.update([answer('更早', 'older'), answer('初始')])
  expect(hook.metrics.top).toBe(620)
  expect(hook.state.pinned).toBe(false)
  hook.metrics.height = 1700
  hook.update([answer('更早', 'older'), answer('增长')])
  expect(hook.metrics.top).toBe(620)
})

test('content loading respects reading position, and switching session clears old prepend state', () => {
  const hook = setup()
  hook.metrics.height = 1300
  act(() => hook.state.onContentLoad())
  expect(hook.metrics.top).toBe(1100)
  hook.metrics.top = 100
  act(() => hook.state.onScroll())
  hook.metrics.height = 1600
  act(() => hook.state.onContentLoad())
  expect(hook.metrics.top).toBe(100)
  act(() => hook.state.markPrepend())
  hook.update([answer('新会话')], 2)
  expect(hook.metrics.top).toBe(1400)
  hook.update([answer('终端')], 2, false)
  hook.metrics.height = 1900
  hook.update([answer('返回聊天')], 2)
  expect(hook.metrics.top).toBe(1700)
})
