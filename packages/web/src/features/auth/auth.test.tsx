import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
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
  fireEvent.change(screen.getByLabelText('username'), { target: { value: 'admin' } })
  fireEvent.change(screen.getByLabelText('password'), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  await waitFor(() => expect(login).toHaveBeenCalledWith('admin', 'pw'))
})
