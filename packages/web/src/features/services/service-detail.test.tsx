import type { ServicePresence, SessionView, WorkerView } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { ServiceDetail } from './service-detail'

vi.mock('../projects/project-stream', () => ({ subscribeProject: () => () => {} }))

afterEach(cleanup)

const worker = {
  id: 20,
  projectId: 1,
  name: 'codex',
  hostname: 'macmini',
  connected: true,
} as WorkerView

const session = {
  id: 7,
  projectId: 1,
  workerId: 20,
  name: 'service-session',
} as SessionView

const service: ServicePresence = {
  workerId: 20,
  sessionId: 7,
  name: 'web',
  startedAt: Date.now() - 120_000,
  publicUrl: 'https://jingzhe.fmap.dev',
  note: 'Spec Factory preview',
}

const renderDetail = (api: Api, open = vi.fn()) => {
  render(
    <ApiContext.Provider value={api}>
      <ServiceDetail projectId={1} workerId={20} name="web" open={open} />
    </ApiContext.Provider>,
  )
  return open
}

test('shows runtime metadata, copies the public URL, opens its session, and stops', async () => {
  let running = true
  const writeText = vi.fn(async () => undefined)
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  const stop = vi.fn(async () => {
    running = false
  })
  const api = {
    services: {
      listByProject: vi.fn(async () => (running ? [service] : [])),
      stop,
    },
    workers: { listByProject: vi.fn(async () => [worker]) },
    sessions: { listByProject: vi.fn(async () => [session]) },
  } as unknown as Api
  const open = renderDetail(api)

  const link = await screen.findByRole('link', { name: service.publicUrl })
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toContain('noopener')
  expect(screen.getByText(service.note as string)).toBeTruthy()
  expect(screen.getByText('codex')).toBeTruthy()
  expect(screen.getByText('2m')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'service-session' }))
  expect(open).toHaveBeenCalledWith('/proj/1/session/7', 'service-session')
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(service.publicUrl))
  expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Stop service' }))
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await waitFor(() => expect(stop).toHaveBeenCalledWith(20, 'web'))
  expect(await screen.findByText('Service is no longer running.')).toBeTruthy()
})

test('keeps details visible when stop fails', async () => {
  const api = {
    services: {
      listByProject: vi.fn(async () => [service]),
      stop: vi.fn(async () => {
        throw new Error('worker offline')
      }),
    },
    workers: { listByProject: vi.fn(async () => [worker]) },
    sessions: { listByProject: vi.fn(async () => [session]) },
  } as unknown as Api
  renderDetail(api)

  await screen.findByText('Spec Factory preview')
  fireEvent.click(screen.getByRole('button', { name: 'Stop service' }))
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Couldn’t stop web.')
  expect(screen.getByText('Spec Factory preview')).toBeTruthy()
})

test('shows an ended state when the service is absent', async () => {
  const api = {
    services: { listByProject: vi.fn(async () => []), stop: vi.fn() },
    workers: { listByProject: vi.fn(async () => [worker]) },
    sessions: { listByProject: vi.fn(async () => [session]) },
  } as unknown as Api
  renderDetail(api)

  expect(await screen.findByText('Service is no longer running.')).toBeTruthy()
  expect(screen.queryByText('Spec Factory preview')).toBeNull()
})
