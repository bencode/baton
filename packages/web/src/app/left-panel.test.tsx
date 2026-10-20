import type { Project } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Api } from '../api'
import { ApiContext } from './api-context'
import { LeftPanel } from './left-panel'

beforeEach(() => localStorage.clear())
afterEach(cleanup)

const project: Project = { id: 1, workspaceId: 1, name: 'web', createdAt: 0 }
const worker = { id: 1, projectId: 1, name: 'w', hostname: 'h', connected: true }
const session = {
  id: 7,
  projectId: 1,
  workerId: 1,
  name: 'dogfood',
  busy: false,
  attached: false,
  connected: true,
  lastActiveAt: Date.now(),
  worker: { name: 'w', hostname: 'h' },
}

const fakeApi = (overrides: { remove?: () => Promise<undefined> } = {}) =>
  ({
    auth: { me: vi.fn(async () => ({ authRequired: false, user: null })) },
    projects: { listByWorkspace: vi.fn(async () => [project]), get: vi.fn(async () => project) },
    services: { listByProject: vi.fn(async () => []) },
    sessions: {
      listByProject: vi.fn(async () => [session]),
      remove: overrides.remove ?? vi.fn(),
    },
    workerCreations: { templates: vi.fn(async () => []), listByProject: vi.fn(async () => []) },
    workers: { listByProject: vi.fn(async () => [worker]) },
    channels: { listByWorkspace: vi.fn(async () => []) },
    files: { branches: vi.fn(async () => []) },
  }) as unknown as Api

const renderPanel = (api: Api, close = vi.fn()) =>
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter>
        <LeftPanel
          onNewSession={vi.fn()}
          onCollapse={vi.fn()}
          onContextNavigate={vi.fn()}
          workspaceId={1}
          projectId={1}
          activeId="/proj/1"
          open={vi.fn()}
          close={close}
        />
      </MemoryRouter>
    </ApiContext.Provider>,
  )

test('Files replaces work items and keeps the sessions panel mounted', async () => {
  const api = fakeApi()
  renderPanel(api)
  expect(await screen.findByText('dogfood')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '工作项' })).toBeNull()
  // Hidden panels never fetch: no file request until Files is shown.
  expect(api.files.branches).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Files' }))
  expect(await screen.findByRole('button', { name: /^w/ })).toBeTruthy()
  await vi.waitFor(() => expect(api.files.branches).toHaveBeenCalledWith(1, expect.anything()))
  expect(screen.getByText('dogfood')).toBeTruthy()
})

test('rail session row: trash → inline confirm → removes session and closes its tab', async () => {
  const remove = vi.fn(async () => undefined)
  const close = vi.fn()
  renderPanel(fakeApi({ remove }), close)
  // Trash is two-step: first click reveals the confirm, not a deletion.
  fireEvent.click(await screen.findByLabelText('删除会话'))
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('确认删除'))
  expect(remove).toHaveBeenCalledWith(7)
  // The tab close happens after the remove promise resolves.
  await vi.waitFor(() => expect(close).toHaveBeenCalledWith('/proj/1/session/7'))
})
