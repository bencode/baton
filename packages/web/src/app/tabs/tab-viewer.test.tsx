import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, test } from 'vitest'
import { TabViewer } from './tab-viewer'

const tabs = [
  { id: '/a', title: 'A', lastActiveAt: 1 },
  { id: '/b', title: 'B', lastActiveAt: 2 },
]
const Editor = () => {
  const [value, setValue] = useState('')
  return <input aria-label="Draft" value={value} onChange={event => setValue(event.target.value)} />
}
const viewer = (activeId: string) => (
  <TabViewer
    tabs={tabs}
    activeId={activeId}
    renderTab={() => <Editor />}
    empty={<p>Project start</p>}
  />
)

afterEach(cleanup)

test('switching to another page or a project start never unmounts an open draft', () => {
  const { rerender } = render(viewer('/a'))
  fireEvent.change(screen.getByRole('textbox', { name: 'Draft' }), { target: { value: 'keep me' } })
  rerender(viewer('/b'))
  rerender(viewer('/proj/2'))
  expect(screen.getByText('Project start')).toBeTruthy()
  rerender(viewer('/a'))
  expect((screen.getByRole('textbox', { name: 'Draft' }) as HTMLInputElement).value).toBe('keep me')
})
