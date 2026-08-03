import type { Loop } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
