import { describe, expect, test } from 'vitest'
import { formatDuration, formatLimitType, turnSummaryParts } from './turn-divider'

describe('formatDuration', () => {
  test('ms / seconds / minutes thresholds', () => {
    expect(formatDuration(800)).toBe('800ms')
    expect(formatDuration(1500)).toBe('1.5s')
    expect(formatDuration(90_000)).toBe('1m 30s')
  })
})

describe('formatLimitType', () => {
  test('maps known windows, dashes the rest', () => {
    expect(formatLimitType('one_hour')).toBe('1h')
    expect(formatLimitType('five_hour')).toBe('5h')
    expect(formatLimitType('daily')).toBe('24h')
    expect(formatLimitType('some_other_window')).toBe('some-other-window')
  })
})

describe('turnSummaryParts', () => {
  test('orders duration · cost · subtype, tones a non-success subtype red', () => {
    expect(
      turnSummaryParts('success', {
        durationMs: 1500,
        totalCostUsd: 0.1234,
        subtype: 'error_max_turns',
      }),
    ).toEqual([{ text: '1.5s' }, { text: '$0.1234' }, { text: 'error_max_turns', tone: 'red' }])
  })
  test('drops a success subtype and absent fields', () => {
    expect(turnSummaryParts('success', { subtype: 'success', durationMs: 500 })).toEqual([
      { text: '500ms' },
    ])
    expect(turnSummaryParts('success')).toEqual([])
  })
  test('rate-limit rejection tones red; the error variant appends its message', () => {
    expect(
      turnSummaryParts(
        'error',
        undefined,
        { rateLimitType: 'five_hour', status: 'rejected' },
        'spawn failed',
      ),
    ).toEqual([
      { text: '5h rejected', tone: 'red' },
      { text: 'spawn failed', tone: 'red' },
    ])
  })
  test('a message only shows on the error variant', () => {
    expect(turnSummaryParts('success', undefined, undefined, 'ignored')).toEqual([])
  })
})
