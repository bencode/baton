import type { Loop } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { LoopsPanel } from './loops-panel'

afterEach(cleanup)

const loop: Loop = {
  id: 7,
  sessionId: 3,
  message: 'Check the task list',
  intervalSec: 600,
  enabled: true,
  nextRunAt: 1_000,
  lastRunAt: 500,
  lastStatus: 'ok',
  createdAt: 0,
  updatedAt: 0,
}

const renderPanel = (loops: Loop[] = []) => {
  const create = vi.fn(async () => loop)
  const update = vi.fn(async () => loop)
  const remove = vi.fn(async () => undefined)
  const api = {
    loops: { listBySession: vi.fn(async () => loops), create, update, remove },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <LoopsPanel sessionId={3} projectId={2} />
    </ApiContext.Provider>,
  )
  return { create, update, remove }
}

test('creates a multiline scheduled task only from the explicit button', async () => {
  const { create } = renderPanel()
  const message = await screen.findByLabelText(/Message/)
  fireEvent.change(message, { target: { value: '  first line\nsecond line  ' } })

  fireEvent.keyDown(message, { key: 'Enter' })
  expect(create).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(3, {
      message: 'first line\nsecond line',
      intervalSec: 1_800,
    }),
  )
  expect((message as HTMLTextAreaElement).value).toBe('')
})

test('rejects fractional interval values through native form validation', async () => {
  const { create } = renderPanel()
  fireEvent.change(await screen.findByLabelText(/Message/), { target: { value: 'Check status' } })
  fireEvent.change(screen.getByLabelText('interval value'), { target: { value: '1.5' } })

  fireEvent.click(screen.getByRole('button', { name: 'Create task' }))

  expect(create).not.toHaveBeenCalled()
})

test('requires inline confirmation before deleting and surfaces a failed removal', async () => {
  const { remove } = renderPanel([loop])
  remove.mockRejectedValueOnce(new Error('cannot delete task'))

  fireEvent.click(await screen.findByLabelText('delete scheduled task'))
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

  expect(remove).toHaveBeenCalledWith(7)
  expect((await screen.findByRole('alert')).textContent).toContain('cannot delete task')
})

test('clear configuration is opt-in and starts at two hours when enabled', async () => {
  const { create } = renderPanel()
  fireEvent.change(await screen.findByLabelText(/Message/), {
    target: { value: 'Collect messages' },
  })
  const toggle = screen.getByRole('checkbox', { name: '自动清理上下文' }) as HTMLInputElement
  expect(toggle.checked).toBe(false)
  fireEvent.click(toggle)
  expect((screen.getByLabelText('清理周期数值') as HTMLInputElement).value).toBe('2')
  fireEvent.click(screen.getByRole('button', { name: 'Create task' }))
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(3, {
      message: 'Collect messages',
      intervalSec: 1_800,
      clearAfterSec: 7_200,
    }),
  )
})

test('existing task clear settings can be changed, cancelled and disabled', async () => {
  const { update } = renderPanel([{ ...loop, clearAfterSec: 7_200, nextClearAt: 9_000 }])
  expect(await screen.findByText('上下文清理：每 2h')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '设置清理' }))
  let editor = within(screen.getByRole('form', { name: '任务 7 的上下文清理' }))
  fireEvent.change(editor.getByLabelText('清理周期数值'), { target: { value: '4' } })
  fireEvent.click(editor.getByRole('button', { name: '取消' }))
  expect(update).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '设置清理' }))
  editor = within(screen.getByRole('form', { name: '任务 7 的上下文清理' }))
  expect((editor.getByLabelText('清理周期数值') as HTMLInputElement).value).toBe('2')
  fireEvent.change(editor.getByLabelText('清理周期数值'), { target: { value: '4' } })
  fireEvent.click(editor.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(update).toHaveBeenCalledWith(7, { clearAfterSec: 14_400 }))
  await waitFor(() =>
    expect(screen.queryByRole('form', { name: '任务 7 的上下文清理' })).toBeNull(),
  )
  fireEvent.click(screen.getByRole('button', { name: '设置清理' }))
  editor = within(screen.getByRole('form', { name: '任务 7 的上下文清理' }))
  fireEvent.click(editor.getByRole('checkbox', { name: '自动清理上下文' }))
  fireEvent.click(editor.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(update).toHaveBeenLastCalledWith(7, { clearAfterSec: null }))
})

test('invalid clear durations are blocked and failed saves retain the draft', async () => {
  const { update } = renderPanel([loop])
  update.mockRejectedValueOnce(new Error('Could not save clear settings'))
  fireEvent.click(await screen.findByRole('button', { name: '设置清理' }))
  const editor = within(screen.getByRole('form', { name: '任务 7 的上下文清理' }))
  fireEvent.click(editor.getByRole('checkbox', { name: '自动清理上下文' }))
  const input = editor.getByLabelText('清理周期数值')
  for (const value of ['', '0', '1.5', '2161']) {
    fireEvent.change(input, { target: { value } })
    expect((editor.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true)
  }
  fireEvent.change(input, { target: { value: '4' } })
  fireEvent.click(editor.getByRole('button', { name: '保存' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Could not save clear settings')
  expect((input as HTMLInputElement).value).toBe('4')
  await waitFor(() =>
    expect((editor.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  )
})
