import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { QueuedMessages } from './queued-messages'

afterEach(cleanup)

test('deletes the selected queued message and disables an in-flight row', () => {
  const onCancel = vi.fn()
  render(
    <QueuedMessages
      queued={[
        {
          id: 7,
          sessionId: 1,
          text: 'first',
          images: [],
          attachments: [],
          planMode: false,
          model: null,
          effort: null,
          replyExpected: false,
          createdAt: 0,
        },
        {
          id: 8,
          sessionId: 1,
          text: 'second',
          images: [],
          attachments: [],
          planMode: false,
          model: null,
          effort: null,
          replyExpected: false,
          createdAt: 0,
        },
      ]}
      cancelling={new Set([8])}
      error={null}
      onCancel={onCancel}
    />,
  )

  fireEvent.click(screen.getByText('待发送 · 2'))
  const buttons = screen.getAllByRole('button', { name: /撤回待发送消息/ })
  expect((buttons[1] as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(buttons[0] as HTMLButtonElement)
  expect(onCancel).toHaveBeenCalledWith(7)
})

test('cancellation feedback remains visible when the server queue is empty', () => {
  render(
    <QueuedMessages
      queued={[]}
      cancelling={new Set()}
      error="该消息已开始执行或已移除，无法撤回"
      onCancel={vi.fn()}
    />,
  )
  expect(screen.getByRole('alert').textContent).toContain('无法撤回')
})
