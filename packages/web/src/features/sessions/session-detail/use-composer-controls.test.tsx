import type { SessionView } from '@baton/shared'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { createApi } from '../../../api'
import { ApiContext } from '../../../app/api-context'
import { useComposerControls } from './use-composer-controls'

afterEach(cleanup)
// Only the settings are consumed here; runtime fields intentionally stay in the owner.
const session = { id: 1, planMode: false, model: null, effort: null } as SessionView
const setup = () => {
  const api = createApi()
  const refresh = vi.fn()
  const mode = vi.spyOn(api.sessions, 'setMode')
  const model = vi.spyOn(api.sessions, 'setModel')
  const abort = vi.spyOn(api.sessions, 'abort')
  const hook = renderHook(
    ({ value }) => useComposerControls({ session: value, onRefresh: refresh }),
    {
      initialProps: { value: session },
      wrapper: ({ children }: { children: ReactNode }) => (
        <ApiContext value={api}>{children}</ApiContext>
      ),
    },
  )
  return { hook, mode, model, abort, refresh }
}

test('settings show only confirmed values and failed requests unlock for manual retry', async () => {
  const { hook, mode, model, refresh } = setup()
  let done!: (value: SessionView) => void
  mode.mockReturnValue(
    new Promise(resolve => {
      done = resolve
    }),
  )
  let pending!: Promise<boolean>
  act(() => {
    pending = hook.result.current.setMode(true)
    void hook.result.current.setMode(true)
  })
  expect(hook.result.current.settings.planMode).toBe(false)
  expect(mode).toHaveBeenCalledOnce()
  await act(async () => {
    done({ ...session, planMode: true })
    await pending
  })
  expect(hook.result.current.settings.planMode).toBe(true)
  expect(refresh).toHaveBeenCalledOnce()
  model.mockRejectedValueOnce(new Error('保存失败')).mockResolvedValueOnce({
    ...session,
    planMode: true,
    model: 'gateway/custom',
    effort: 'max',
  })
  await act(() => hook.result.current.setModel(' gateway/custom ', 'max'))
  expect(hook.result.current.settings.model).toBeNull()
  expect(hook.result.current.error).toBe('保存失败')
  expect(hook.result.current.saving).toBeNull()
  await act(() => hook.result.current.setModel(' gateway/custom ', 'max'))
  expect(model).toHaveBeenLastCalledWith(1, 'gateway/custom', 'max')
  expect(hook.result.current.settings.effort).toBe('max')
  hook.rerender({ value: { ...session, planMode: true, model: 'external', effort: 'high' } })
  expect(hook.result.current.settings.model).toBe('external')
})

test('stop acknowledgement is a notice; failure releases controls without changing runtime state', async () => {
  const { hook, abort } = setup()
  abort.mockRejectedValueOnce(new Error('断开连接')).mockResolvedValueOnce(session)
  await act(() => hook.result.current.abort())
  expect(hook.result.current.pending).toBeNull()
  expect(hook.result.current.error).toBe('断开连接')
  await act(() => hook.result.current.abort())
  expect(hook.result.current.notice).toContain('已请求停止')
  expect(hook.result.current.error).toBeNull()
})
