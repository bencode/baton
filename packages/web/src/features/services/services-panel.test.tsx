import type { ServicePresence, SessionView, WorkerView } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { ServicesPanel } from './services-panel'

afterEach(cleanup)

const worker = {
  id: 20,
  projectId: 1,
  name: 'glm',
  hostname: 'macmini',
  connected: true,
} as WorkerView

const session = {
  id: 7,
  projectId: 1,
  workerId: 20,
  name: 'smoke-glm',
  busy: false,
  attached: true,
} as SessionView

const service: ServicePresence = {
  workerId: 20,
  sessionId: 7,
  name: 'web',
  startedAt: Date.now() - 120_000,
}

test('lists a live service, opens its session, and confirms before stopping it', async () => {
  const stop = vi.fn(async () => undefined)
  const open = vi.fn()
  const api = {
    services: { listByProject: vi.fn(async () => [service]), stop },
  } as unknown as Api

  render(
    <ApiContext.Provider value={api}>
      <ServicesPanel projectId={1} workers={[worker]} sessions={[session]} open={open} />
    </ApiContext.Provider>,
  )

  fireEvent.click(await screen.findByText('web'))
  expect(open).toHaveBeenCalledWith('/proj/1/session/7', 'smoke-glm')
  expect(screen.getByText('glm · smoke-glm')).toBeTruthy()
  expect(screen.getByText('2m')).toBeTruthy()

  fireEvent.click(screen.getByLabelText('stop web'))
  expect(stop).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('confirm stop web'))
  await waitFor(() => expect(stop).toHaveBeenCalledWith(20, 'web'))
})

test('keeps a service visible and reports a failed stop', async () => {
  const api = {
    services: {
      listByProject: vi.fn(async () => [service]),
      stop: vi.fn(async () => {
        throw new Error('worker offline')
      }),
    },
  } as unknown as Api

  render(
    <ApiContext.Provider value={api}>
      <ServicesPanel projectId={1} workers={[worker]} sessions={[session]} open={vi.fn()} />
    </ApiContext.Provider>,
  )

  await screen.findByText('web')
  fireEvent.click(screen.getByLabelText('stop web'))
  fireEvent.click(screen.getByLabelText('confirm stop web'))
  expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t stop web.')
  expect(screen.getByText('web')).toBeTruthy()
})
