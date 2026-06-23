import type { SessionView, WorkerView } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { WorkersPanel } from './workers-panel'

afterEach(cleanup)

const worker = {
  id: 2,
  projectId: 1,
  name: 'macmini',
  hostname: 'mac',
  connected: true,
} as WorkerView
const session = (id: number): SessionView =>
  ({
    id,
    projectId: 1,
    workerId: 2,
    name: `s${id}`,
    busy: false,
    attached: false,
    lastActiveAt: 0,
  }) as unknown as SessionView

const renderPanel = () => {
  const remove = vi.fn(async () => undefined)
  const close = vi.fn()
  const api = {
    workers: { listByProject: vi.fn(async () => [worker]), remove },
    sessions: { listByProject: vi.fn(async () => [session(7), session(8)]) },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <WorkersPanel projectId={1} activeId="" open={vi.fn()} close={close} />
    </ApiContext.Provider>,
  )
  return { remove, close }
}

test('deleting a worker needs a confirm, then removes it + closes its session tabs', async () => {
  const { remove, close } = renderPanel()
  // Trash → confirm view (with the cascade count); nothing deleted yet.
  fireEvent.click(await screen.findByLabelText('delete worker'))
  expect(remove).not.toHaveBeenCalled()
  expect(screen.getByText('delete + 2 sessions?')).toBeTruthy()
  // Confirm → remove worker #2 and close its two open tabs.
  fireEvent.click(screen.getByLabelText('confirm delete worker'))
  expect(remove).toHaveBeenCalledWith(2)
  await waitFor(() => expect(close).toHaveBeenCalledTimes(2))
})
