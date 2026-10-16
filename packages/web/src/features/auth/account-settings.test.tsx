import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { type Api, ApiError } from '../../api'
import { ApiContext } from '../../app/api-context'
import { AccountSettings } from './account-settings'

afterEach(cleanup)
const setup = (changePassword = vi.fn(async () => ({ ok: true }))) => {
  render(
    <ApiContext.Provider value={{ auth: { changePassword } } as unknown as Api}>
      <AccountSettings onClose={vi.fn()} />
    </ApiContext.Provider>,
  )
  fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'old-password' } })
  fireEvent.change(screen.getByLabelText('新密码'), { target: { value: 'new-password' } })
  return changePassword
}

test('password update submits existing fields and clears them only after success', async () => {
  const changePassword = setup()
  fireEvent.click(screen.getByRole('button', { name: '更新密码' }))
  expect(changePassword).toHaveBeenCalledWith('old-password', 'new-password')
  await screen.findByRole('status')
  expect((screen.getByLabelText('当前密码') as HTMLInputElement).value).toBe('')
  expect((screen.getByLabelText('新密码') as HTMLInputElement).value).toBe('')
})

test.each([
  [new ApiError('Unauthorized', 401), '当前密码不正确，或登录已失效，请确认后重试'],
  [new TypeError('Network unavailable'), '密码更新失败，请稍后重试'],
])('password failure is visible and can be retried: %s', async (error, message) => {
  const changePassword = setup(vi.fn(async () => ({ ok: true })).mockRejectedValueOnce(error))
  fireEvent.click(screen.getByRole('button', { name: '更新密码' }))
  expect((await screen.findByRole('alert')).textContent).toBe(message)
  expect((screen.getByLabelText('新密码') as HTMLInputElement).value).toBe('new-password')
  fireEvent.click(screen.getByRole('button', { name: '更新密码' }))
  await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(2))
  expect((await screen.findByRole('status')).textContent).toBe('密码已更新')
})
