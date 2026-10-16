import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import { type Api, ApiError } from '../../api'
import { ApiContext } from '../../app/api-context'
import { LoginPage } from './login-page'
import { RequireAuth } from './require-auth'

afterEach(cleanup)

const withApi = (api: Partial<Api>, ui: React.ReactNode, path = '/') =>
  render(
    <ApiContext.Provider value={api as Api}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>login screen</div>} />
          <Route path="*" element={ui} />
        </Routes>
      </MemoryRouter>
    </ApiContext.Provider>,
  )

test('RequireAuth renders children when /auth/me resolves', async () => {
  const auth = {
    me: vi.fn(async () => ({ authRequired: false, user: null })),
  } as unknown as Api['auth']
  withApi({ auth }, <RequireAuth>protected</RequireAuth>)
  expect(await screen.findByText('protected')).toBeTruthy()
})

test('RequireAuth redirects to /login when /auth/me rejects (401)', async () => {
  const auth = {
    me: vi.fn(async () => {
      throw new Error('401')
    }),
  } as unknown as Api['auth']
  withApi({ auth }, <RequireAuth>protected</RequireAuth>)
  expect(await screen.findByText('login screen')).toBeTruthy()
})

test('LoginPage posts credentials on submit', async () => {
  const login = vi.fn(async () => ({ user: { id: 1, username: 'admin', createdAt: 0 } }))
  const auth = { login } as unknown as Api['auth']
  withApi({ auth }, <LoginPage />)
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'pw'))
})

test.each([
  [new ApiError('Unauthorized', 401), '用户名或密码错误'],
  [new TypeError('Network unavailable'), '登录失败，请稍后重试'],
])('login failure provides accurate feedback and keeps credentials: %s', async (error, message) => {
  const login = vi.fn().mockRejectedValueOnce(error)
  withApi({ auth: { login } as unknown as Api['auth'] }, <LoginPage />)
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'member' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  expect((await screen.findByRole('alert')).textContent).toBe(message)
  expect((screen.getByLabelText('用户名') as HTMLInputElement).value).toBe('member')
  expect((screen.getByRole('button', { name: '登录' }) as HTMLButtonElement).disabled).toBe(false)
})

test('submitting an in-flight login again does not send another request', () => {
  const login = vi.fn(() => new Promise(() => undefined))
  const { container } = withApi({ auth: { login } as unknown as Api['auth'] }, <LoginPage />)
  fireEvent.change(screen.getByLabelText('用户名'), { target: { value: 'member' } })
  fireEvent.change(screen.getByLabelText('密码'), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: '登录' }))
  const form = container.querySelector('form')
  if (!form) throw new Error('Missing login form')
  fireEvent.submit(form)
  expect(login).toHaveBeenCalledTimes(1)
  expect((screen.getByLabelText('用户名') as HTMLInputElement).disabled).toBe(true)
})
