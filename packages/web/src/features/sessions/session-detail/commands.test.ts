import { describe, expect, test } from 'vitest'
import { matchCommands, parseSlash, resolveCommand } from './commands'

describe('parseSlash', () => {
  test('splits name + args, lowercases name; null for non-slash', () => {
    expect(parseSlash('/clear')).toEqual({ name: 'clear', args: '' })
    expect(parseSlash('/CLEAR')).toEqual({ name: 'clear', args: '' })
    expect(parseSlash('/plan refactor the auth')).toEqual({
      name: 'plan',
      args: 'refactor the auth',
    })
    expect(parseSlash('/clear  extra')).toEqual({ name: 'clear', args: 'extra' })
    expect(parseSlash('hello')).toBeNull()
    expect(parseSlash('see /clear later')).toBeNull()
  })
})

describe('matchCommands', () => {
  test('shows matches only while typing the name (no space yet)', () => {
    expect(matchCommands('/').map(c => c.name)).toEqual(['help', 'clear', 'abort', 'plan', 'model'])
    expect(matchCommands('/cl').map(c => c.name)).toEqual(['clear'])
    expect(matchCommands('/clear ')).toEqual([]) // space → typing args, menu hidden
    expect(matchCommands('hi')).toEqual([])
    expect(matchCommands('/zzz')).toEqual([])
  })

  test('"/model <prefix>" suggests aliases; exact match / free-form hide the menu', () => {
    // Suggestions carry the arg as data — picking one runs the command with it.
    expect(matchCommands('/model s')[0]).toMatchObject({ kind: 'model', args: 'sonnet' })
    // Name matching is case-insensitive (parseSlash lowercases), like commands.
    expect(matchCommands('/MODEL s').map(c => c.name)).toEqual(['model sonnet'])
    expect(matchCommands('/model ').map(c => c.name)).toEqual([
      'model sonnet',
      'model opus',
      'model haiku',
    ])
    expect(matchCommands('/model s').map(c => c.name)).toEqual(['model sonnet'])
    expect(matchCommands('/model sonnet')).toEqual([]) // exact → Enter runs, no re-pick
    expect(matchCommands('/model claude-opus-4-8')).toEqual([]) // free-form passes through
  })
})

describe('resolveCommand', () => {
  test('resolves a known command; unknown / non-slash → null', () => {
    expect(resolveCommand('/clear')?.command.kind).toBe('clear')
    expect(resolveCommand('/help')?.command.kind).toBe('help')
    expect(resolveCommand('/nope')).toBeNull()
    expect(resolveCommand('just text')).toBeNull()
  })

  test('bare /plan resolves — it is a no-arg toggle now (any trailing text ignored)', () => {
    expect(resolveCommand('/plan')?.command.kind).toBe('plan')
    expect(resolveCommand('/plan ')?.command.kind).toBe('plan')
  })

  test('/model carries the name as args; bare /model resolves with empty args (reset)', () => {
    expect(resolveCommand('/model sonnet')).toMatchObject({
      command: { kind: 'model' },
      args: 'sonnet',
    })
    expect(resolveCommand('/model')).toMatchObject({ command: { kind: 'model' }, args: '' })
  })
})
