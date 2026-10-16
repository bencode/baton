import { act, cleanup, render } from '@testing-library/react'
import { useRef } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { useAutosize } from './use-autosize'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
test('text and width changes resize to the cap; height-only observation does not loop', () => {
  let notify!: () => void
  const disconnect = vi.fn()
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        notify = callback
      }
      observe() {}
      disconnect = disconnect
    },
  )
  let width = 500
  let height = 80
  let reads = 0
  const Host = ({ value }: { value: string }) => {
    const ref = useRef<HTMLTextAreaElement>(null)
    useAutosize(ref, value)
    return (
      <textarea
        ref={node => {
          ref.current = node
          if (!node) return
          node.getBoundingClientRect = () => ({ width }) as DOMRect
          Object.defineProperty(node, 'scrollHeight', {
            configurable: true,
            get: () => {
              reads += 1
              return height
            },
          })
        }}
        defaultValue={value}
      />
    )
  }
  const view = render(<Host value="a" />)
  const input = view.container.querySelector('textarea')
  expect(input?.style.height).toBe('80px')
  height = 300
  width = 250
  act(() => notify())
  expect(input?.style.height).toBe('192px')
  const before = reads
  act(() => notify())
  expect(reads).toBe(before)
  height = 50
  view.rerender(<Host value="" />)
  expect(input?.style.height).toBe('50px')
  view.unmount()
  expect(disconnect).toHaveBeenCalled()
})
