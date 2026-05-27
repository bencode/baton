import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../api.ts'
import { ApiContext } from './api-context.ts'
import { HealthBadge } from './app.tsx'

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
