import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { Popover } from '../../components/popover'
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
  fireEvent.click(screen.getByRole('combobox', { name: '切换工作区' }))
  const beta = await screen.findByRole('option', { name: 'beta' })
  fireEvent.pointerDown(beta, { pointerType: 'mouse' })
  fireEvent.mouseDown(beta)
  fireEvent.mouseUp(beta)
  fireEvent.click(beta)
  expect(onNavigate).toHaveBeenCalledOnce()
})

test('nested workspace selection handles mouse and Escape without dismissing the settings panel', async () => {
  const api = {
    workspaces: {
      list: vi.fn(async () => [
        { id: 1, name: 'alpha' },
        { id: 2, name: 'beta' },
      ]),
    },
  } as unknown as Api
  const Host = () => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)
    return (
      <>
        <button type="button" onClick={event => setAnchor(event.currentTarget)}>
          打开配置
        </button>
        <Popover anchor={anchor} label="配置" role="dialog" onClose={() => setAnchor(null)}>
          <WorkspaceSwitcher activeWorkspaceId={1} />
        </Popover>
      </>
    )
  }
  render(
    <ApiContext value={api}>
      <MemoryRouter>
        <Host />
      </MemoryRouter>
    </ApiContext>,
  )
  fireEvent.click(screen.getByRole('button', { name: '打开配置' }))
  const trigger = await screen.findByRole('combobox', { name: '切换工作区' })
  fireEvent.click(trigger)
  const beta = await screen.findByRole('option', { name: 'beta' })
  fireEvent.mouseDown(beta)
  expect(screen.getByRole('dialog', { name: '配置' })).toBeTruthy()
  fireEvent.keyDown(beta, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  expect(screen.getByRole('dialog', { name: '配置' })).toBeTruthy()
  expect(document.activeElement).toBe(trigger)
  fireEvent.keyDown(trigger, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '配置' })).toBeNull()
})
