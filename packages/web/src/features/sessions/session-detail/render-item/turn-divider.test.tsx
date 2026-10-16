import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { TurnDivider } from './turn-divider'

afterEach(cleanup)

test('end metadata includes only provided values and exposes a non-success cause', () => {
  render(
    <TurnDivider
      item={{
        kind: 'turn-end',
        key: 'end',
        turnIndex: 1,
        result: { durationMs: 1500, totalCostUsd: 0.1234, subtype: 'error_max_turns' },
      }}
    />,
  )
  expect(screen.getByText('1.5 秒')).toBeTruthy()
  expect(screen.getByText('$0.1234')).toBeTruthy()
  expect(screen.getByText('结束原因：error_max_turns')).toBeTruthy()
})

test('absent metadata does not fabricate duration, cost, or cause', () => {
  render(<TurnDivider item={{ kind: 'turn-end', key: 'end', turnIndex: 2 }} />)
  expect(screen.getByLabelText('第 2 轮结束').textContent).toBe('本轮结束')
})

test('a process error keeps its original text without announcing a failed turn', () => {
  const message = 'Reconnecting... 2/5\nrequest timed out'
  const { container } = render(
    <TurnDivider item={{ kind: 'turn-error', key: 'error', turnIndex: 1, message }} />,
  )
  expect(screen.queryByText('本轮未完成')).toBeNull()
  const details = container.querySelector('details')
  expect(details?.open).toBe(false)
  fireEvent.click(container.querySelector('summary')!)
  expect(details?.open).toBe(true)
  expect(container.querySelector('pre')?.textContent).toBe(message)
})

test('explicit failure and rejected rate limit remain visible without guessing recovery', () => {
  render(
    <TurnDivider
      item={{
        kind: 'turn-error',
        key: 'error',
        turnIndex: 3,
        finalFailure: true,
        message: 'spawn ENOENT',
        rateLimit: { status: 'rejected', rateLimitType: 'requests' },
      }}
    />,
  )
  expect(screen.getByText('本轮未完成')).toBeTruthy()
  expect(screen.getByText('请求受到限流')).toBeTruthy()
  expect(screen.getByText('未提供恢复时间，可稍后再发起操作。')).toBeTruthy()
})

test('a supplied reset time is retained even without type or status', () => {
  const { container } = render(
    <TurnDivider
      item={{ kind: 'turn-end', key: 'end', turnIndex: 1, rateLimit: { resetsAt: 1800000000 } }}
    />,
  )
  expect(container.querySelector('time')?.getAttribute('datetime')).toBe(
    new Date(1800000000000).toISOString(),
  )
})
