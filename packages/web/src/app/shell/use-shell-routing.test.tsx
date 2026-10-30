import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, expect, test, vi } from 'vitest'
import { type Api, ApiError } from '../../api'
import { ApiContext } from '../api-context'
import { useShellRouting } from './use-shell-routing'

const workspace = { id: 9, name: 'yuer', createdAt: 0 }
const project = { id: 23, workspaceId: workspace.id, name: 'en', createdAt: 0 }

beforeEach(() => localStorage.clear())

test('an inaccessible cached project recovers through the first accessible workspace', async () => {
  const projectScoped = <T,>(projectId: number, value: T): Promise<T> =>
    projectId === project.id
      ? Promise.resolve(value)
      : Promise.reject(new ApiError('not found', 404))
  const api = {
    workspaces: { list: vi.fn(async () => [workspace]) },
    projects: {
      get: vi.fn((id: number) => projectScoped(id, project)),
      listByWorkspace: vi.fn(async () => [project]),
    },
    sessions: { listByProject: vi.fn((id: number) => projectScoped(id, [])) },
  } as unknown as Api
  const Harness = () => {
    const { pathname } = useLocation()
    const { workspaceId } = useShellRouting({
      activeId: pathname,
      cacheScope: 'user-5',
      tabs: [],
      retitle: vi.fn(),
    })
    return (
      <>
        <output aria-label="Current path">{pathname}</output>
        <output aria-label="Workspace">{workspaceId}</output>
      </>
    )
  }

  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter initialEntries={['/proj/999']}>
        <Harness />
      </MemoryRouter>
    </ApiContext.Provider>,
  )

  await waitFor(() => expect(screen.getByLabelText('Current path').textContent).toBe('/proj/23'))
  await waitFor(() => expect(screen.getByLabelText('Workspace').textContent).toBe('9'))
  await waitFor(() => expect(localStorage.getItem('baton.last-path.user-5')).toBe('/proj/23'))
  expect(api.sessions.listByProject).toHaveBeenCalledWith(999)
  expect(api.sessions.listByProject).toHaveBeenCalledWith(23)
})
