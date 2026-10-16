import type { Project } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { ProjectSwitcher } from './project-switcher'

const projects: Project[] = [
  { id: 1, workspaceId: 1, name: 'alpha', createdAt: 0 },
  { id: 2, workspaceId: 1, name: 'beta', createdAt: 0 },
]
const Location = () => <output aria-label="Path">{useLocation().pathname}</output>
afterEach(cleanup)
const setup = (list: Project[], create = vi.fn(async () => projects[0])) => {
  const onNavigate = vi.fn()
  const api = { projects: { listByWorkspace: vi.fn(async () => list), create } } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter initialEntries={['/proj/1']}>
        <ProjectSwitcher
          workspaceId={1}
          activeProjectId={list.length ? 1 : null}
          onNavigate={onNavigate}
        />
        <Location />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  return { create, onNavigate }
}

test('project selection changes the route and notifies the shell', async () => {
  const { onNavigate } = setup(projects)
  await waitFor(() =>
    expect((screen.getByLabelText('切换项目') as HTMLButtonElement).disabled).toBe(false),
  )
  fireEvent.click(screen.getByLabelText('切换项目'))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'beta' }))
  expect(screen.getByLabelText('Path').textContent).toBe('/proj/2')
  expect(onNavigate).toHaveBeenCalledOnce()
})

test('creating the first project keeps the name-only contract', async () => {
  const { create } = setup([])
  await waitFor(() =>
    expect((screen.getByLabelText('切换项目') as HTMLButtonElement).disabled).toBe(false),
  )
  fireEvent.click(screen.getByLabelText('切换项目'))
  fireEvent.click(screen.getByRole('button', { name: '新建项目' }))
  fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: ' alpha ' } })
  fireEvent.click(screen.getByRole('button', { name: '创建' }))
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/proj/1'))
  expect(create).toHaveBeenCalledWith({ workspaceId: 1, name: 'alpha' })
})

test('creation failure keeps the form usable for a manual retry', async () => {
  const create = vi.fn(async () => projects[0]).mockRejectedValueOnce(new Error('Creation failed'))
  setup([], create)
  await waitFor(() =>
    expect((screen.getByLabelText('切换项目') as HTMLButtonElement).disabled).toBe(false),
  )
  fireEvent.click(screen.getByLabelText('切换项目'))
  fireEvent.click(screen.getByRole('button', { name: '新建项目' }))
  fireEvent.change(screen.getByLabelText('项目名称'), { target: { value: 'alpha' } })
  fireEvent.click(screen.getByRole('button', { name: '创建' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Creation failed')
  fireEvent.click(screen.getByRole('button', { name: '创建' }))
  await waitFor(() => expect(create).toHaveBeenCalledTimes(2))
})

test('a failed project list can be loaded again without reloading the page', async () => {
  const listByWorkspace = vi
    .fn(async () => projects)
    .mockRejectedValueOnce(new Error('Network unavailable'))
  const api = { projects: { listByWorkspace } } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter>
        <ProjectSwitcher workspaceId={1} activeProjectId={1} />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  await waitFor(() =>
    expect((screen.getByLabelText('切换项目') as HTMLButtonElement).disabled).toBe(false),
  )
  fireEvent.click(screen.getByLabelText('切换项目'))
  expect(screen.getByRole('alert').textContent).toContain('无法加载项目')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('menuitemradio', { name: 'beta' })).toBeTruthy()
  expect(listByWorkspace).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alert')).toBeNull()
})
