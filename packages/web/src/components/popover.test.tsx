import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { Popover } from './popover'

afterEach(cleanup)
const Fixture = ({ onAction = vi.fn() }: { onAction?(): void }) => {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <>
      <button type="button" onClick={event => setAnchor(event.currentTarget)}>
        打开菜单
      </button>
      <Popover anchor={anchor} role="menu" label="测试菜单" onClose={() => setAnchor(null)}>
        <button type="button" role="menuitem" onClick={onAction}>
          第一项
        </button>
        <button type="button" role="menuitem" disabled>
          不可用
        </button>
        <button type="button" role="menuitem">
          最后一项
        </button>
      </Popover>
    </>
  )
}
test('menu skips disabled actions and Escape restores its trigger', () => {
  render(<Fixture />)
  fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '第一项' }))
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '最后一项' }))
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Home' })
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '第一项' }))
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Escape' })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '打开菜单' }))
})
test('action mousedown keeps the menu alive, while outside mousedown dismisses', () => {
  const onAction = vi.fn()
  render(<Fixture onAction={onAction} />)
  fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
  const first = screen.getByRole('menuitem', { name: '第一项' })
  fireEvent.mouseDown(first)
  fireEvent.click(first)
  expect(onAction).toHaveBeenCalledOnce()
  fireEvent.mouseDown(document.body)
  expect(screen.queryByRole('menu')).toBeNull()
})
test('a menu opened inside a modal stays in its native top layer', () => {
  render(
    <dialog open>
      <Fixture />
    </dialog>,
  )
  fireEvent.click(screen.getByRole('button', { name: '打开菜单' }))
  expect(screen.getByRole('menu').closest('dialog')).not.toBeNull()
})

test('an empty dialog still receives focus so Escape can close it', () => {
  const anchor = document.createElement('button')
  document.body.append(anchor)
  const onClose = vi.fn()
  render(
    <Popover anchor={anchor} role="dialog" label="空配置" onClose={onClose}>
      <p>暂无工作区</p>
    </Popover>,
  )
  expect(document.activeElement).toBe(screen.getByRole('dialog'))
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(onClose).toHaveBeenCalledWith('escape')
  expect(document.activeElement).toBe(anchor)
  anchor.remove()
})
