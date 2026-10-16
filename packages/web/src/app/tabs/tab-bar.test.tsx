import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { TabBar } from './tab-bar'
import type { Tab } from './tabs-model'

afterEach(cleanup)

const tabs: Tab[] = [
  { id: '/t/a', title: 'a', lastActiveAt: 1 },
  { id: '/t/b', title: 'b', lastActiveAt: 2 },
  { id: '/t/c', title: 'c', lastActiveAt: 3 },
]

const noop = () => {}

// Regression: a mousedown on a context-menu item used to bubble to the
// document dismiss listener, unmounting the menu before the item's click
// fired — so every batch-close item (Close others/right/all) was inert.
test('context-menu item fires its handler on click (mousedown does not dismiss first)', () => {
  const onCloseOthers = vi.fn()
  render(
    <TabBar
      tabs={tabs}
      activeId="/t/a"
      onSelect={noop}
      onClose={noop}
      onCloseOthers={onCloseOthers}
      onCloseRight={noop}
      onCloseAll={noop}
    />,
  )
  fireEvent.contextMenu(screen.getByRole('button', { name: 'b' }))
  const item = screen.getByRole('menuitem', { name: '关闭其他页签' })
  // A real click is mousedown then click; the mousedown must not kill the menu.
  fireEvent.mouseDown(item)
  fireEvent.click(item)
  expect(onCloseOthers).toHaveBeenCalledWith('/t/b')
})

// The dismiss path itself must still work: a mousedown outside closes the menu.
test('mousedown outside the menu dismisses it', () => {
  render(
    <TabBar
      tabs={tabs}
      activeId="/t/a"
      onSelect={noop}
      onClose={noop}
      onCloseOthers={noop}
      onCloseRight={noop}
      onCloseAll={noop}
    />,
  )
  fireEvent.contextMenu(screen.getByRole('button', { name: 'b' }))
  expect(screen.queryByRole('menu')).not.toBeNull()
  fireEvent.mouseDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
})

test('tab actions are reachable without a context click and support keyboard focus', () => {
  const onClose = vi.fn()
  render(
    <TabBar
      tabs={tabs}
      activeId="/t/a"
      onSelect={noop}
      onClose={onClose}
      onCloseOthers={noop}
      onCloseRight={noop}
      onCloseAll={noop}
    />,
  )
  fireEvent.click(screen.getByRole('button', { name: '页签操作' }))
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '关闭当前页签' }))
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '关闭其他页签' }))
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '页签操作' }))
})

test('closing the active tab from its context menu focuses the remaining tab', async () => {
  const Fixture = () => {
    const [entries, setEntries] = useState(tabs)
    const [active, setActive] = useState('/t/a')
    return (
      <TabBar
        tabs={entries}
        activeId={active}
        onSelect={setActive}
        onClose={id => {
          setEntries(items => items.filter(item => item.id !== id))
          setActive('/t/b')
        }}
        onCloseOthers={noop}
        onCloseRight={noop}
        onCloseAll={noop}
      />
    )
  }
  render(<Fixture />)
  fireEvent.contextMenu(screen.getByRole('button', { name: 'a' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '关闭当前页签' }))
  await waitFor(() =>
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'b' })),
  )
})
