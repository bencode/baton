import type { ServicePresence, WorkerView } from '@baton/shared'
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

const service: ServicePresence = {
  workerId: 20,
  cwd: '/project/7',
  name: 'web',
  startedAt: Date.now() - 120_000,
  publicUrl: 'https://jingzhe.fmap.dev',
  note: 'Spec Factory preview',
}

const renderDetail = (api: Api) => {
  render(
    <ApiContext.Provider value={api}>
      <ServiceDetail projectId={1} workerId={20} name="web" />
    </ApiContext.Provider>,
  )
}

test('shows runtime metadata, copies the public URL, shows its directory, and stops', async () => {
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
  } as unknown as Api
  renderDetail(api)

  const link = await screen.findByRole('link', { name: service.publicUrl })
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toContain('noopener')
  expect(screen.getByText(service.note as string)).toBeTruthy()
  expect(screen.getByText('codex')).toBeTruthy()
  expect(screen.getByText('2m')).toBeTruthy()

  expect(screen.getByText(service.cwd)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '复制' }))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(service.publicUrl))
  expect(screen.getByRole('button', { name: '已复制' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: '停止服务' }))
  fireEvent.click(screen.getByRole('button', { name: '确认停止' }))
  await waitFor(() => expect(stop).toHaveBeenCalledWith(20, 'web'))
  expect(await screen.findByText('服务已结束运行。')).toBeTruthy()
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
  } as unknown as Api
  renderDetail(api)

  await screen.findByText('Spec Factory preview')
  fireEvent.click(screen.getByRole('button', { name: '停止服务' }))
  fireEvent.click(screen.getByRole('button', { name: '确认停止' }))
  expect((await screen.findByRole('alert')).textContent).toContain('无法停止 web，')
  expect(screen.getByText('Spec Factory preview')).toBeTruthy()
})

test('shows an ended state when the service is absent', async () => {
  const api = {
    services: { listByProject: vi.fn(async () => []), stop: vi.fn() },
    workers: { listByProject: vi.fn(async () => [worker]) },
  } as unknown as Api
  renderDetail(api)

  expect(await screen.findByText('服务已结束运行。')).toBeTruthy()
  expect(screen.queryByText('Spec Factory preview')).toBeNull()
})
