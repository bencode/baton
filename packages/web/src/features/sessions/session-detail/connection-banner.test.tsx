import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ConnectionBanner } from './connection-banner'

afterEach(cleanup)

test('normal and initial connecting states do not create an error notice', () => {
  const { rerender } = render(<ConnectionBanner streamStatus="open" connected />)
  expect(screen.queryByRole('status')).toBeNull()
  rerender(<ConnectionBanner streamStatus="connecting" connected={false} />)
  expect(screen.queryByRole('status')).toBeNull()
})

test('live connection loss takes precedence over stale worker connectivity', () => {
  render(<ConnectionBanner streamStatus="error" connected={false} />)
  expect(screen.getByRole('status').textContent).toContain('实时连接已中断')
  expect(screen.queryByText('执行环境离线')).toBeNull()
})

test('a healthy stream can report the worker offline without promising message delivery', () => {
  render(<ConnectionBanner streamStatus="open" connected={false} />)
  expect(screen.getByRole('status').textContent).toContain('执行需等待环境恢复连接')
})
