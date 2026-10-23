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
  runsSinceClear: 0,
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
  const message = await screen.findByLabelText(/消息/)
  fireEvent.change(message, { target: { value: '  first line\nsecond line  ' } })

  fireEvent.keyDown(message, { key: 'Enter' })
  expect(create).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(3, {
      message: 'first line\nsecond line',
      intervalSec: 1_800,
      clearEveryRuns: null,
    }),
  )
  expect((message as HTMLTextAreaElement).value).toBe('')
})

test('rejects fractional interval values through native form validation', async () => {
  const { create } = renderPanel()
  fireEvent.change(await screen.findByLabelText(/消息/), { target: { value: 'Check status' } })
  fireEvent.change(screen.getByLabelText('间隔数值'), { target: { value: '1.5' } })

  fireEvent.click(screen.getByRole('button', { name: '创建任务' }))

  expect(create).not.toHaveBeenCalled()
})

test('requires inline confirmation before deleting and surfaces a failed removal', async () => {
  const { remove } = renderPanel([loop])
  remove.mockRejectedValueOnce(new Error('cannot delete task'))

  fireEvent.click(await screen.findByLabelText('删除定时任务'))
  expect(remove).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }))

  expect(remove).toHaveBeenCalledWith(7)
  expect((await screen.findByRole('alert')).textContent).toContain('cannot delete task')
})

test('context defaults to kept; fresh-each-run creates with a count of one', async () => {
  const { create } = renderPanel()
  fireEvent.change(await screen.findByLabelText(/消息/), {
    target: { value: 'Collect messages' },
  })
  const form = within(screen.getByRole('form', { name: '新建定时任务' }))
  expect((form.getByRole('radio', { name: '保留' }) as HTMLInputElement).checked).toBe(true)
  fireEvent.click(form.getByRole('radio', { name: '每次执行前清空' }))
  fireEvent.click(form.getByRole('button', { name: '创建任务' }))
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith(3, {
      message: 'Collect messages',
      intervalSec: 1_800,
      clearEveryRuns: 1,
    }),
  )
})

test('editing prefills the task and saves message, interval and clear count together', async () => {
  const { update } = renderPanel([{ ...loop, clearEveryRuns: 4, runsSinceClear: 2 }])
  expect(await screen.findByText('上下文：每 4 次清空')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  let editor = within(screen.getByRole('form', { name: '编辑任务 7' }))
  expect((editor.getByLabelText(/消息/) as HTMLTextAreaElement).value).toBe('Check the task list')
  expect((editor.getByLabelText('间隔数值') as HTMLInputElement).value).toBe('10')
  expect((editor.getByLabelText('间隔单位') as HTMLSelectElement).value).toBe('min')
  expect((editor.getByLabelText('清空间隔次数') as HTMLInputElement).value).toBe('4')
  expect(editor.getByText('· 约 40m')).toBeTruthy()
  fireEvent.click(editor.getByRole('button', { name: '取消' }))
  expect(update).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: '编辑' }))
  editor = within(screen.getByRole('form', { name: '编辑任务 7' }))
  fireEvent.change(editor.getByLabelText(/消息/), { target: { value: 'Check again' } })
  fireEvent.change(editor.getByLabelText('间隔数值'), { target: { value: '1' } })
  fireEvent.change(editor.getByLabelText('间隔单位'), { target: { value: 'hour' } })
  fireEvent.change(editor.getByLabelText('清空间隔次数'), { target: { value: '6' } })
  fireEvent.click(editor.getByRole('button', { name: '保存' }))
  await waitFor(() =>
    expect(update).toHaveBeenCalledWith(7, {
      message: 'Check again',
      intervalSec: 3_600,
      clearEveryRuns: 6,
    }),
  )
  await waitFor(() => expect(screen.queryByRole('form', { name: '编辑任务 7' })).toBeNull())
})

test('invalid clear counts are blocked and failed saves keep the editor open', async () => {
  const { update } = renderPanel([loop])
  update.mockRejectedValueOnce(new Error('Could not save task'))
  fireEvent.click(await screen.findByRole('button', { name: '编辑' }))
  const editor = within(screen.getByRole('form', { name: '编辑任务 7' }))
  const input = editor.getByLabelText('清空间隔次数')
  for (const value of ['', '0', '1.5', '1001']) {
    fireEvent.change(input, { target: { value } })
    expect((editor.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true)
  }
  fireEvent.change(input, { target: { value: '3' } })
  fireEvent.click(editor.getByRole('button', { name: '保存' }))
  expect((await editor.findByRole('alert')).textContent).toContain('Could not save task')
  expect((input as HTMLInputElement).value).toBe('3')
  await waitFor(() =>
    expect((editor.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(
      false,
    ),
  )
})
