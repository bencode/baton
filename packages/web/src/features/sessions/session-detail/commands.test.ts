import { describe, expect, test } from 'vitest'
import { matchCommands, parseSlash, resolveCommand } from './commands'

describe('parseSlash', () => {
  test('splits name + args, lowercases name; null for non-slash', () => {
    expect(parseSlash('/clear')).toEqual({ name: 'clear', args: '' })
    expect(parseSlash('/CLEAR')).toEqual({ name: 'clear', args: '' })
    expect(parseSlash('/plan refactor the auth')).toEqual({ name: 'plan', args: 'refactor the auth' })
    expect(parseSlash('/clear  extra')).toEqual({ name: 'clear', args: 'extra' })
    expect(parseSlash('hello')).toBeNull()
    expect(parseSlash('see /clear later')).toBeNull()
  })
})

describe('matchCommands', () => {
  test('shows matches only while typing the name (no space yet)', () => {
    expect(matchCommands('/').map(c => c.name)).toEqual(['help', 'clear', 'abort', 'plan'])
    expect(matchCommands('/cl').map(c => c.name)).toEqual(['clear'])
    expect(matchCommands('/clear ')).toEqual([]) // space → typing args, menu hidden
    expect(matchCommands('hi')).toEqual([])
    expect(matchCommands('/zzz')).toEqual([])
  })
})

describe('resolveCommand', () => {
  test('resolves a known command; unknown / non-slash → null', () => {
    expect(resolveCommand('/clear')?.command.kind).toBe('clear')
    expect(resolveCommand('/help')?.command.kind).toBe('help')
    expect(resolveCommand('/nope')).toBeNull()
    expect(resolveCommand('just text')).toBeNull()
  })

  test('an args-taking command needs args (bare /plan → null, falls through)', () => {
    expect(resolveCommand('/plan')).toBeNull()
    expect(resolveCommand('/plan ')).toBeNull()
    expect(resolveCommand('/plan do X')).toEqual({
      command: expect.objectContaining({ kind: 'plan' }),
      args: 'do X',
    })
  })
})
