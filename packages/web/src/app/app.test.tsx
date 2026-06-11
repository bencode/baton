import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../api'
import { ApiContext } from './api-context'
import { HealthBadge, Shell } from './app'

afterEach(cleanup)

const renderBadge = (api: Api) =>
  render(
    <ApiContext.Provider value={api}>
      <HealthBadge />
    </ApiContext.Provider>,
  )

test('HealthBadge shows "ok" when /health resolves', async () => {
  const api = { health: vi.fn(async () => ({ ok: true })) } as unknown as Api
  renderBadge(api)
  expect(await screen.findByText('server: ok')).toBeTruthy()
})

test('HealthBadge shows "unreachable" when /health rejects', async () => {
  const api = {
    health: vi.fn(async () => {
      throw new Error('down')
    }),
  } as unknown as Api
  renderBadge(api)
  expect(await screen.findByText('server: unreachable')).toBeTruthy()
})

test('Shell renders the top bar, a resize separator and empty states with no data', async () => {
  const api = {
    health: vi.fn(async () => ({ ok: true })),
    workspaces: { list: vi.fn(async () => []) },
    auth: { me: vi.fn(async () => ({ authRequired: false, user: null })) },
  } as unknown as Api
  const { container } = render(
    <ApiContext.Provider value={api}>
      <MemoryRouter initialEntries={['/']}>
        <Shell />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  expect(screen.getByText('baton')).toBeTruthy()
  expect(await screen.findByText('no workspace')).toBeTruthy()
  expect(screen.getByText('Select a project.')).toBeTruthy()
  expect(screen.getByText('Nothing open.')).toBeTruthy()
  expect(container.querySelector('[data-separator]')).toBeTruthy()
})
