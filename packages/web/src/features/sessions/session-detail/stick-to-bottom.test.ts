import { describe, expect, test } from 'vitest'
import { atBottom, STICK_THRESHOLD } from './stick-to-bottom'

describe('atBottom', () => {
  test('exactly at the bottom is pinned', () => {
    expect(atBottom(1000, 800, 200)).toBe(true) // distance 0
  })

  test('within the threshold is pinned', () => {
    expect(atBottom(1000, 760, 200, 60)).toBe(true) // distance 40
  })

  test('beyond the threshold is not pinned', () => {
    expect(atBottom(1000, 700, 200, 60)).toBe(false) // distance 100
  })

  test('scrolled to the top is not pinned', () => {
    expect(atBottom(1000, 0, 200, 60)).toBe(false)
  })

  test('content shorter than the viewport is pinned', () => {
    expect(atBottom(200, 0, 200, 60)).toBe(true) // negative distance
  })

  test('default threshold is applied', () => {
    expect(atBottom(1000, 1000 - 200 - STICK_THRESHOLD, 200)).toBe(true)
    expect(atBottom(1000, 1000 - 200 - STICK_THRESHOLD - 1, 200)).toBe(false)
  })
})
