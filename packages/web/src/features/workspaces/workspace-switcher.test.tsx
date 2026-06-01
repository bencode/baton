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
  fireEvent.click(await screen.findByLabelText('rename workspace'))
  const input = screen.getByLabelText('workspace name')
  fireEvent.change(input, { target: { value: 'trantor' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  await waitFor(() => expect(update).toHaveBeenCalledWith(1, { name: 'trantor' }))
})
