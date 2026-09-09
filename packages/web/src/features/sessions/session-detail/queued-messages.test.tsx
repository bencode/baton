import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { QueuedMessages } from './queued-messages'

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

  const buttons = screen.getAllByRole('button', { name: 'delete queued message' })
  expect((buttons[1] as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(buttons[0] as HTMLButtonElement)
  expect(onCancel).toHaveBeenCalledWith(7)
})
