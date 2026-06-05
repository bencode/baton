import { describe, expect, test } from 'vitest'
import { relativeTime } from './relative-time'

describe('relativeTime', () => {
  const now = Date.parse('2026-06-05T12:00:00Z')
  const ago = (ms: number) => relativeTime(now - ms, now)

  test('buckets seconds/minutes/hours/days', () => {
    expect(ago(10_000)).toBe('刚刚') // <1m
    expect(ago(5 * 60_000)).toBe('5分钟前')
    expect(ago(3 * 3600_000)).toBe('3小时前')
    expect(ago(25 * 3600_000)).toBe('昨天')
    expect(ago(3 * 86_400_000)).toBe('3天前')
  })

  test('beyond a week → a date (not relative)', () => {
    const out = ago(10 * 86_400_000)
    expect(out).not.toMatch(/前|昨天|刚刚/)
  })
})
