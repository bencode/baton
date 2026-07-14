import type { AgentKind } from '@baton/shared'
import { describe, expect, test } from 'vitest'
import { matchCommands, parseModelArgs, parseSlash, resolveCommand } from './commands'

const CLAUDE: AgentKind = 'claude-code'
const CODEX: AgentKind = 'codex'

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
    expect(matchCommands('/', CLAUDE).map(c => c.name)).toEqual([
      'help',
      'clear',
      'abort',
      'plan',
      'model',
    ])
    expect(matchCommands('/cl', CLAUDE).map(c => c.name)).toEqual(['clear'])
    expect(matchCommands('/clear ', CLAUDE)).toEqual([]) // space → typing args, menu hidden
    expect(matchCommands('hi', CLAUDE)).toEqual([])
    expect(matchCommands('/zzz', CLAUDE)).toEqual([])
  })

  test('"/model" suggests only the session agent\'s models — the two never cross', () => {
    const claude = matchCommands('/model ', CLAUDE).map(c => c.args)
    const codex = matchCommands('/model ', CODEX).map(c => c.args)
    expect(claude).toContain('opus max')
    expect(codex).toContain('gpt-5.6-sol xhigh')
    // The whole point: a codex session is never offered a claude model, or vice versa.
    expect(claude.some(a => a?.startsWith('gpt-'))).toBe(false)
    expect(codex.some(a => a === 'opus' || a === 'sonnet' || a === 'haiku')).toBe(false)
  })

  test('"/model <prefix>" filters; exact match / free-form hide the menu', () => {
    // Suggestions carry the arg as data — picking one runs the command with it.
    expect(matchCommands('/model s', CLAUDE)[0]).toMatchObject({ kind: 'model', args: 'sonnet' })
    // Name matching is case-insensitive (parseSlash lowercases), like commands.
    expect(matchCommands('/MODEL s', CLAUDE).map(c => c.args)).toEqual(['sonnet', 'sonnet high'])
    expect(matchCommands('/model opus ', CLAUDE).map(c => c.args)).toEqual([]) // exact → Enter runs
    expect(matchCommands('/model opus x', CLAUDE).map(c => c.args)).toEqual(['opus xhigh'])
    expect(matchCommands('/model claude-opus-4-8', CLAUDE)).toEqual([]) // free-form passes through
    expect(matchCommands('/model gpt-5.5 high', CODEX)).toEqual([]) // not a preset → still fine
  })
})

describe('parseModelArgs', () => {
  test('"<name> [effort]": lone token is always the model, never an effort', () => {
    expect(parseModelArgs('opus')).toEqual({ model: 'opus', effort: null })
    expect(parseModelArgs('opus max')).toEqual({ model: 'opus', effort: 'max' })
    expect(parseModelArgs('gpt-5.6-sol xhigh')).toEqual({ model: 'gpt-5.6-sol', effort: 'xhigh' })
    // Free-form: a model that isn't in any preset list still parses.
    expect(parseModelArgs('glm-4.6 high')).toEqual({ model: 'glm-4.6', effort: 'high' })
  })

  test('bare /model = reset both', () => {
    expect(parseModelArgs('')).toEqual({ model: null, effort: null })
    expect(parseModelArgs('   ')).toEqual({ model: null, effort: null })
  })

  test('a bad effort is rejected, not silently dropped', () => {
    const bad = parseModelArgs('opus higgh')
    expect(bad.error).toMatch(/unknown effort/)
    expect(bad.model).toBeNull() // must not fall back to setting the model alone
    expect(parseModelArgs('opus high extra').error).toMatch(/bad args/)
  })
})

describe('resolveCommand', () => {
  test('resolves a known command; unknown / non-slash → null', () => {
    expect(resolveCommand('/clear', CLAUDE)?.command.kind).toBe('clear')
    expect(resolveCommand('/help', CLAUDE)?.command.kind).toBe('help')
    expect(resolveCommand('/nope', CLAUDE)).toBeNull()
    expect(resolveCommand('just text', CLAUDE)).toBeNull()
  })

  test('bare /plan resolves — it is a no-arg toggle now (any trailing text ignored)', () => {
    expect(resolveCommand('/plan', CLAUDE)?.command.kind).toBe('plan')
    expect(resolveCommand('/plan ', CLAUDE)?.command.kind).toBe('plan')
  })

  test('/model carries the args; bare /model resolves with empty args (reset)', () => {
    expect(resolveCommand('/model sonnet high', CLAUDE)).toMatchObject({
      command: { kind: 'model' },
      args: 'sonnet high',
    })
    expect(resolveCommand('/model', CLAUDE)).toMatchObject({ command: { kind: 'model' }, args: '' })
  })
})
