import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  const item = screen.getByRole('menuitem', { name: 'Close others' })
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
