import type { User } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { UserMenu } from './user-menu'

afterEach(cleanup)
const Location = () => <output aria-label="路径">{useLocation().pathname}</output>
const setup = (
  user: User | null,
  me: Api['auth']['me'] = async () => ({ authRequired: user !== null, user, hasToken: false }),
) => {
  const logout = vi.fn(async () => undefined)
  const api = { auth: { me, logout } } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <MemoryRouter>
        <UserMenu context={<button type="button">工作区控件</button>} />
        <Location />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
  return { logout }
}
const member: User = { id: 1, username: 'Ben', isAdmin: false, createdAt: 0 }

test('local mode retains workspace controls without account actions', async () => {
  setup(null)
  fireEvent.click(await screen.findByRole('button', { name: '本地模式，配置' }))
  expect(screen.getByRole('button', { name: '工作区控件' })).toBeTruthy()
  expect(screen.queryByText('退出登录')).toBeNull()
  expect(screen.queryByText('账号设置')).toBeNull()
})
test('member sees account actions and can log out', async () => {
  const { logout } = setup(member)
  fireEvent.click(await screen.findByRole('button', { name: 'Ben，配置' }))
  expect(screen.getByRole('button', { name: '账号设置' })).toBeTruthy()
  expect(screen.queryByText('运行大屏')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
  await waitFor(() => expect(screen.getByLabelText('路径').textContent).toBe('/login'))
  expect(logout).toHaveBeenCalledOnce()
})
test('admin retains the operations entry', async () => {
  setup({ ...member, isAdmin: true })
  fireEvent.click(await screen.findByRole('button', { name: 'Ben，配置' }))
  fireEvent.click(screen.getByRole('button', { name: '运行大屏' }))
  expect(screen.getByLabelText('路径').textContent).toBe('/ops')
})
test('identity failure is visible and never presented as local mode', async () => {
  const me = vi
    .fn(async () => ({ authRequired: false, user: null, hasToken: false }))
    .mockRejectedValueOnce(new Error('Offline'))
  setup(null, me)
  fireEvent.click(screen.getByRole('button', { name: '设置，配置' }))
  expect((await screen.findByRole('alert')).textContent).toContain('无法加载账号')
  expect(screen.queryByRole('button', { name: '本地模式，配置' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await screen.findByRole('button', { name: '本地模式，配置' })
})
