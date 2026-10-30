import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { useTabs } from './use-tabs'

const Harness = () => {
  const tabs = useTabs('user-1')
  const navigate = useNavigate()
  return (
    <>
      <button type="button" onClick={() => tabs.closeOthers('/proj/1/session/1')}>
        Keep first
      </button>
      <button type="button" onClick={() => navigate(-1)}>
        Back
      </button>
      <output aria-label="Path">{tabs.activeId}</output>
      <output aria-label="Count">{tabs.tabs.length}</output>
      <button type="button" onClick={() => tabs.open('/proj/2/settings', 'Settings')}>
        Open other
      </button>
      <button
        type="button"
        onClick={() => tabs.closeMatching(tab => tab.id.startsWith('/proj/1/'), '/proj/2')}
      >
        Delete project one
      </button>
      <button type="button" onClick={() => tabs.close(tabs.activeId)}>
        Close active
      </button>
      <button type="button" onClick={() => navigate('/proj/3')}>
        Start project three
      </button>
    </>
  )
}
const initial = [1, 2, 3].map(id => ({
  id: `/proj/1/session/${id}`,
  title: `s${id}`,
  lastActiveAt: id,
}))
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('baton.tabs.user-1', JSON.stringify(initial))
})
afterEach(cleanup)

test('closing an active tab activates the right surviving neighbor', () => {
  render(
    <MemoryRouter initialEntries={['/proj/1/session/2']}>
      <Harness />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Close active'))
  expect(screen.getByLabelText('Path').textContent).toBe('/proj/1/session/3')
})

test('batch deletion closes matching tabs and preserves the latest cross-project active tab', () => {
  render(
    <MemoryRouter initialEntries={['/proj/1/session/2']}>
      <Harness />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Open other'))
  fireEvent.click(screen.getByText('Delete project one'))
  expect(screen.getByLabelText('Path').textContent).toBe('/proj/2/settings')
  expect(screen.getByLabelText('Count').textContent).toBe('1')
})

test('batch deletion of the active project uses its explicit fallback', () => {
  render(
    <MemoryRouter initialEntries={['/proj/1/session/2']}>
      <Harness />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Delete project one'))
  expect(screen.getByLabelText('Path').textContent).toBe('/proj/2')
  expect(screen.getByLabelText('Count').textContent).toBe('0')
})

test('project navigation leaves persisted tabs open for later visits', () => {
  render(
    <MemoryRouter initialEntries={['/proj/1/session/2']}>
      <Harness />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Start project three'))
  expect(screen.getByLabelText('Count').textContent).toBe('3')
  expect(JSON.parse(localStorage.getItem('baton.tabs.user-1') ?? '[]')).toHaveLength(3)
})

test('tabs from another authenticated user are not restored', () => {
  const OtherUserHarness = () => {
    const tabs = useTabs('user-2')
    return <output aria-label="Other user count">{tabs.tabs.length}</output>
  }
  render(
    <MemoryRouter>
      <OtherUserHarness />
    </MemoryRouter>,
  )
  expect(screen.getByLabelText('Other user count').textContent).toBe('0')
})

test('closing other tabs pushes only one navigation entry', () => {
  render(
    <MemoryRouter initialEntries={['/proj/1/session/1', '/proj/1/session/2']}>
      <Harness />
    </MemoryRouter>,
  )
  fireEvent.click(screen.getByText('Keep first'))
  expect(screen.getByLabelText('Path').textContent).toBe('/proj/1/session/1')
  fireEvent.click(screen.getByText('Back'))
  expect(screen.getByLabelText('Path').textContent).toBe('/proj/1/session/2')
})
