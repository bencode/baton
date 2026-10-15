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

test('project selection changes the route and management actions are no longer in the switcher', async () => {
  const api = { projects: { listByWorkspace: vi.fn(async () => projects) } } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter initialEntries={['/proj/1']}>
        <ProjectSwitcher workspaceId={1} activeProjectId={1} />
        <Location />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  await screen.findByRole('option', { name: 'beta' })
  fireEvent.change(screen.getByLabelText('Project'), { target: { value: '2' } })
  expect(screen.getByLabelText('Path').textContent).toBe('/proj/2')
  expect(screen.queryByLabelText('project actions')).toBeNull()
})

test('creating the first project keeps the existing minimal name-only contract', async () => {
  const create = vi.fn(async () => projects[0])
  const api = { projects: { listByWorkspace: vi.fn(async () => []), create } } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter>
        <ProjectSwitcher workspaceId={1} activeProjectId={null} />
        <Location />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  fireEvent.click(screen.getByLabelText('new project'))
  fireEvent.change(screen.getByLabelText('new project name'), { target: { value: 'alpha' } })
  fireEvent.keyDown(screen.getByLabelText('new project name'), { key: 'Enter' })
  await waitFor(() => expect(screen.getByLabelText('Path').textContent).toBe('/proj/1'))
  expect(create).toHaveBeenCalledWith({ workspaceId: 1, name: 'alpha' })
})
