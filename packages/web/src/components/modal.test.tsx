import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { Modal } from './modal'

afterEach(cleanup)

test('native cancellation and the close button notify the modal owner', () => {
  const onClose = vi.fn()
  render(
    <Modal title="Create something" onClose={onClose}>
      Content
    </Modal>,
  )
  const dialog = screen.getByRole('dialog', { name: 'Create something' })
  expect(dialog.hasAttribute('open')).toBe(true)
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(onClose).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'close', hidden: true }))
  expect(onClose).toHaveBeenCalledTimes(2)
})
