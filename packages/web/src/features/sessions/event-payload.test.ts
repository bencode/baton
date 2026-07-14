import { describe, expect, test } from 'vitest'
import {
  formatToolResult,
  headerModel,
  parseRateLimit,
  parseResult,
  systemActionNotice,
} from './event-payload'

describe('systemActionNotice', () => {
  test('maps each known control action to its notice text', () => {
    expect(systemActionNotice({ action: 'context_cleared' })).toBe(
      'context cleared — fresh conversation',
    )
    expect(systemActionNotice({ action: 'interrupt' })).toBe('interrupted')
    expect(systemActionNotice({ action: 'plan_mode', planMode: true })).toBe('entered plan mode')
    expect(systemActionNotice({ action: 'plan_mode' })).toBe('exited plan mode')
    expect(systemActionNotice({ action: 'model', model: 'opus' })).toBe('model → opus')
    expect(systemActionNotice({ action: 'model', model: 'opus', effort: 'max' })).toBe(
      'model → opus (max)',
    )
    expect(systemActionNotice({ action: 'model' })).toBe('model reset to default')
    // A reset clears both, so effort alone can't linger in the notice.
    expect(systemActionNotice({ action: 'model', effort: 'high' })).toBe('model reset to default')
  })
  test('unknown action / non-record → null (caller falls back to raw)', () => {
    expect(systemActionNotice({ action: 'something_else' })).toBeNull()
    expect(systemActionNotice(null)).toBeNull()
    expect(systemActionNotice('nope')).toBeNull()
  })
})

describe('headerModel', () => {
  test('prefers flat model, falls back to nested model_info.id, else undefined', () => {
    expect(headerModel({ model: 'claude-sonnet-4-6' })).toBe('claude-sonnet-4-6')
    expect(headerModel({ model_info: { id: 'claude-opus' } })).toBe('claude-opus')
    expect(headerModel({})).toBeUndefined()
  })
})

describe('parseResult', () => {
  test('keeps numeric fields, drops non-numbers', () => {
    expect(parseResult({ subtype: 'success', num_turns: 3, total_cost_usd: 0.01 })).toEqual({
      subtype: 'success',
      numTurns: 3,
      totalCostUsd: 0.01,
      durationMs: undefined,
    })
  })
})

describe('parseRateLimit', () => {
  test('reads the nested rate_limit_info', () => {
    expect(
      parseRateLimit({ rate_limit_info: { rateLimitType: 'five_hour', status: 'allowed' } }),
    ).toEqual({ rateLimitType: 'five_hour', status: 'allowed', resetsAt: undefined })
  })
  test('missing rate_limit_info → all undefined', () => {
    expect(parseRateLimit({})).toEqual({
      rateLimitType: undefined,
      status: undefined,
      resetsAt: undefined,
    })
  })
})

describe('formatToolResult', () => {
  test('string content passes through; is_error flag is read', () => {
    expect(formatToolResult({ content: 'done', is_error: true })).toEqual({
      text: 'done',
      isError: true,
    })
  })
  test('array content joins text blocks; non-text blocks stringify', () => {
    expect(formatToolResult({ content: [{ type: 'text', text: 'line1' }, { n: 2 }] })).toEqual({
      text: 'line1\n{"n":2}',
      isError: false,
    })
  })
  test('non-record → empty', () => {
    expect(formatToolResult('nope')).toEqual({ text: '', isError: false })
  })
})
