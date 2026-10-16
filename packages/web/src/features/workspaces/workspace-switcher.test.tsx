import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { WorkspaceSwitcher } from './workspace-switcher'

afterEach(cleanup)

test('inline rename: ✎ → edit → Enter calls api.workspaces.update', async () => {
  const update = vi.fn(async () => ({ id: 1, name: 'trantor', createdAt: 0 }))
  const api = {
    workspaces: {
      list: vi.fn(async () => [{ id: 1, name: 'lesscap', createdAt: 0 }]),
      update,
    },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter>
        <WorkspaceSwitcher activeWorkspaceId={1} />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  fireEvent.click(await screen.findByLabelText('重命名工作区'))
  const input = screen.getByLabelText('工作区名称')
  fireEvent.change(input, { target: { value: 'trantor' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, { name: 'trantor' }))
})

test('rename errors are visible and switching workspaces notifies navigation', async () => {
  const onNavigate = vi.fn()
  const update = vi.fn(async () => {
    throw new Error('Rename failed')
  })
  const api = {
    workspaces: {
      list: vi.fn(async () => [
        { id: 1, name: 'alpha' },
        { id: 2, name: 'beta' },
      ]),
      update,
    },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter>
        <WorkspaceSwitcher activeWorkspaceId={1} onNavigate={onNavigate} />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  fireEvent.click(await screen.findByLabelText('重命名工作区'))
  fireEvent.change(screen.getByLabelText('工作区名称'), { target: { value: 'new name' } })
  fireEvent.keyDown(screen.getByLabelText('工作区名称'), { key: 'Enter' })
  expect((await screen.findByRole('alert')).textContent).toContain('Rename failed')
  fireEvent.change(screen.getByLabelText('切换工作区'), { target: { value: '2' } })
  expect(onNavigate).toHaveBeenCalledOnce()
})
