import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Api } from '../api'
import { AuthContext, type AuthState } from '../features/auth/auth-context'
import { ApiContext } from './api-context'
import { Shell } from './app'
import { HealthBadge } from './shell/health-badge'

beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const localAuth: AuthState = { authRequired: false, user: null, hasToken: false }

const ShellWithAuth = () => (
  <AuthContext.Provider value={localAuth}>
    <Shell />
  </AuthContext.Provider>
)

const renderBadge = (api: Api) =>
  render(
    <ApiContext.Provider value={api}>
      <HealthBadge />
    </ApiContext.Provider>,
  )

test('HealthBadge shows "ok" when /health resolves', async () => {
  const api = { health: vi.fn(async () => ({ ok: true })) } as unknown as Api
  renderBadge(api)
  expect(await screen.findByText('服务连接：正常')).toBeTruthy()
})

test('HealthBadge shows "unreachable" when /health rejects', async () => {
  const api = {
    health: vi.fn(async () => {
      throw new Error('down')
    }),
  } as unknown as Api
  renderBadge(api)
  expect(await screen.findByText('服务连接：无法连接')).toBeTruthy()
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
        <ShellWithAuth />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  expect(screen.getByLabelText('baton')).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: '本地模式，配置' }))
  expect(await screen.findByText('暂无工作区')).toBeTruthy()
  expect(screen.getByText('请选择或创建项目。')).toBeTruthy()
  expect(screen.getByText('选择你的项目')).toBeTruthy()
  expect(container.querySelector('[data-separator]')).toBeTruthy()
})

test('crossing the mobile breakpoint preserves the open page and its unsaved input', async () => {
  let mobile = false
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return mobile
    },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }))
  const project = { id: 1, workspaceId: 1, name: 'Baton', createdAt: 0 }
  const api = {
    health: vi.fn(async () => ({ ok: true })),
    auth: { me: vi.fn(async () => ({ authRequired: false, user: null })) },
    workspaces: { list: vi.fn(async () => [{ id: 1, name: 'Personal' }]) },
    projects: { get: vi.fn(async () => project), listByWorkspace: vi.fn(async () => [project]) },
    sessions: { listByProject: vi.fn(async () => []) },
    workers: { listByProject: vi.fn(async () => []) },
    requirements: { listByProject: vi.fn(async () => []) },
    channels: { listByWorkspace: vi.fn(async () => []) },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter initialEntries={['/proj/1/settings']}>
        <ShellWithAuth />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  fireEvent.change(await screen.findByLabelText('项目名称'), {
    target: { value: 'Unsaved draft' },
  })
  fireEvent.click(screen.getByRole('button', { name: '收起导航' }))
  expect((screen.getByLabelText('项目名称') as HTMLInputElement).value).toBe('Unsaved draft')
  fireEvent.click(screen.getByRole('button', { name: '打开导航' }))
  expect((screen.getByLabelText('项目名称') as HTMLInputElement).value).toBe('Unsaved draft')
  act(() => {
    mobile = true
    listeners.forEach(listener => {
      listener()
    })
  })
  expect((screen.getByLabelText('项目名称') as HTMLInputElement).value).toBe('Unsaved draft')
  act(() => {
    mobile = false
    listeners.forEach(listener => {
      listener()
    })
  })
  expect((screen.getByLabelText('项目名称') as HTMLInputElement).value).toBe('Unsaved draft')
})
