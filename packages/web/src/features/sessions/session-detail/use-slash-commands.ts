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
  onTogglePlanMode: () => void,
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

  // Picking runs or fills depending on the entry. An arg suggestion ("model
  // sonnet") runs with its args. A takesArgs command fills the draft so you
  // keep typing — unless its full name is already typed, where Enter means
  // "run it bare" (bare /model = reset). Everything else runs immediately.
  // Highlight state resets — the menu re-derives from the new draft (a fill
  // opens the arg-suggestion menu, which must start at the top).
  const pick = (cmd: SlashCommand): void => {
    setIndex(0)
    setDismissed(false)
    if (cmd.args === undefined && cmd.takesArgs && draft.trim() !== `/${cmd.name}`) {
      setDraft(`/${cmd.name} `)
      return
    }
    onCommand(cmd, cmd.args ?? '')
    setDraft('')
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    // Shift+Tab toggles plan mode anywhere (mirrors Claude Code). Checked before
    // the menu's plain-Tab pick so it wins even while the autocomplete is open.
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault()
      onTogglePlanMode()
      return true
    }
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
      if ((e.key === 'Enter' && !e.shiftKey) || (e.key === 'Tab' && !e.shiftKey)) {
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
    // Plain Enter on a known command line runs it (including a bare "/plan" — a
    // no-arg toggle now resolves); an unknown slash line falls through to send as
    // plain text. Shift+Enter is always a newline, never a command.
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
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
