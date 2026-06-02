import { type KeyboardEvent, useState } from 'react'
import { matchCommands, resolveCommand, type SlashCommand } from './commands'

// Slash-command behaviour for the composer textarea: the autocomplete menu state
// (highlight + dismiss) and the keyboard handling. Kept out of the composer so
// the input stays focused on attachments/send; the composer renders the menu and
// delegates keydown. onKeyDown returns true when it consumed the event (menu
// navigation or running a command) so the caller skips its own send handling.
export const useSlashCommands = (
  draft: string,
  setDraft: (v: string) => void,
  onCommand: (command: SlashCommand, args: string) => void,
) => {
  const [index, setIndex] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const menu = matchCommands(draft)
  const open = menu.length > 0 && !dismissed
  const activeIndex = Math.min(index, menu.length - 1)

  // Call on every draft change so the highlight resets and Escape un-dismisses.
  const reset = (): void => {
    setIndex(0)
    setDismissed(false)
  }

  // A command with args (/plan) just fills the input so you keep typing; a no-arg
  // command (/clear, /help) runs immediately.
  const pick = (cmd: SlashCommand): void => {
    if (cmd.takesArgs) {
      setDraft(`/${cmd.name} `)
      return
    }
    onCommand(cmd, '')
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex(i => (i + 1) % menu.length)
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex(i => (i - 1 + menu.length) % menu.length)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const cmd = menu[activeIndex]
        if (cmd) pick(cmd)
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setDismissed(true)
        return true
      }
    }
    // Plain Enter on a complete "/command …" line runs it; an unknown slash line
    // falls through to a newline.
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      const resolved = resolveCommand(draft)
      if (resolved) {
        e.preventDefault()
        onCommand(resolved.command, resolved.args)
        setDraft('')
        return true
      }
    }
    return false
  }

  return { menu, open, activeIndex, pick, reset, onKeyDown }
}
