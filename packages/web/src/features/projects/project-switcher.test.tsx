import type { Project } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { ProjectSwitcher } from './project-switcher'

afterEach(cleanup)

const projects: Project[] = [
  { id: 1, workspaceId: 1, name: 'alpha', createdAt: 0 },
  { id: 2, workspaceId: 1, name: 'beta', createdAt: 0 },
]

const Loc = () => <span data-testid="loc">{useLocation().pathname}</span>

const renderSwitcher = () => {
  const remove = vi.fn(async () => undefined)
  const api = {
    projects: { listByWorkspace: vi.fn(async () => projects), remove },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter initialEntries={['/proj/1']}>
        <ProjectSwitcher workspaceId={1} activeProjectId={1} />
        <Loc />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  return { remove }
}

test('project delete needs a confirm, then removes + lands on another project', async () => {
  const { remove } = renderSwitcher()
  // Open the ⋯ menu and click "Delete project" — the menu flips to a confirm view;
  // nothing is deleted yet (the safety boundary: delete must be confirmed).
  fireEvent.click(await screen.findByLabelText('project actions'))
  fireEvent.click(screen.getByText('Delete project'))
  expect(remove).not.toHaveBeenCalled()
  // Confirming deletes the active project (#1) and navigates to the other one (#2).
  fireEvent.click(screen.getByText('Delete'))
  expect(remove).toHaveBeenCalledWith(1)
  await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/proj/2'))
})
