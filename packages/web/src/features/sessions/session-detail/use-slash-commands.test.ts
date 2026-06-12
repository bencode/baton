import { act, renderHook } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import { SLASH_COMMANDS } from './commands'
import { useSlashCommands } from './use-slash-commands'

const modelCmd = SLASH_COMMANDS.find(c => c.name === 'model')
if (!modelCmd) throw new Error('model command missing from registry')

const mount = (draft: string) => {
  const onCommand = vi.fn()
  const setDraft = vi.fn()
  const hook = renderHook(() => useSlashCommands(draft, setDraft, onCommand, vi.fn()))
  return { hook, onCommand, setDraft }
}

// pick() decides run-vs-fill — the seam where a bare "/model" Enter must reset
// instead of walking the user into the suggestion menu (and an accidental set).
describe('useSlashCommands pick', () => {
  test('fills the draft for a takesArgs command still being typed', () => {
    const { hook, onCommand, setDraft } = mount('/mo')
    act(() => hook.result.current.pick(modelCmd))
    expect(setDraft).toHaveBeenCalledWith('/model ')
    expect(onCommand).not.toHaveBeenCalled()
  })

  test('runs bare when the full name is already typed (/model + Enter = reset)', () => {
    const { hook, onCommand, setDraft } = mount('/model')
    act(() => hook.result.current.pick(modelCmd))
    expect(onCommand).toHaveBeenCalledWith(modelCmd, '')
    expect(setDraft).toHaveBeenCalledWith('')
  })

  test('an arg suggestion runs immediately with its args', () => {
    const { hook, onCommand } = mount('/model s')
    const suggestion = hook.result.current.menu[0]
    if (!suggestion) throw new Error('expected a suggestion in the menu')
    expect(suggestion.args).toBe('sonnet')
    act(() => hook.result.current.pick(suggestion))
    expect(onCommand).toHaveBeenCalledWith(suggestion, 'sonnet')
  })
})
