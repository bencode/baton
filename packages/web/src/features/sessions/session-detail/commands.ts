// Slash commands for the session composer (Claude-Code style). Typing "/<name>"
// in the input runs a command instead of sending a normal message. The registry
// feeds both the autocomplete menu and the submit handler.
export type SlashKind = 'help' | 'clear' | 'plan' | 'abort' | 'model'

export type SlashCommand = {
  name: string
  kind: SlashKind
  desc: string
  takesArgs?: boolean // /model <name> — picking from the menu fills the draft to keep typing
  // Registry: menu hints shown after "/name " — common values only; free-form
  // input always passes through verbatim (gateway model ids vary).
  argSuggestions?: string[]
  // Synthetic menu entries only (built by matchCommands from argSuggestions):
  // picking one runs the command with these args immediately.
  args?: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', kind: 'help', desc: 'show available commands' },
  { name: 'clear', kind: 'clear', desc: 'reset the conversation (keeps session + code)' },
  { name: 'abort', kind: 'abort', desc: 'interrupt the running turn (like Esc)' },
  { name: 'plan', kind: 'plan', desc: 'toggle read-only plan mode (no file edits)' },
  {
    name: 'model',
    kind: 'model',
    desc: 'switch model (bare /model resets to default)',
    takesArgs: true,
    argSuggestions: ['sonnet', 'opus', 'haiku'],
  },
]

// Parse the draft as "/name args". null when it isn't a slash line.
export const parseSlash = (draft: string): { name: string; args: string } | null => {
  if (!draft.startsWith('/')) return null
  const rest = draft.slice(1)
  const sp = rest.indexOf(' ')
  return {
    name: (sp === -1 ? rest : rest.slice(0, sp)).toLowerCase(),
    args: sp === -1 ? '' : rest.slice(sp + 1).trim(),
  }
}

// Commands to show in the menu — while typing the name (no space yet), filtered
// by the prefix. Past the name, a command with argSuggestions keeps the menu
// open with arg hints ("/model son" → "model sonnet"); built on parseSlash so
// suggesting and executing agree on what counts as a command line. An arg typed
// out exactly closes the menu, so Enter submits the typed value even when one
// suggestion prefixes another. Empty = menu hidden.
export const matchCommands = (draft: string): SlashCommand[] => {
  if (!draft.startsWith('/')) return []
  if (/\s/.test(draft)) {
    const parsed = parseSlash(draft)
    const command = parsed && SLASH_COMMANDS.find(c => c.name === parsed.name)
    const suggestions = command?.argSuggestions
    if (!parsed || !suggestions || suggestions.includes(parsed.args)) return []
    return suggestions
      .filter(s => s.startsWith(parsed.args))
      .map(s => ({ name: `${command.name} ${s}`, kind: command.kind, desc: '', args: s }))
  }
  const q = draft.slice(1).toLowerCase()
  return SLASH_COMMANDS.filter(c => c.name.startsWith(q))
}

// Resolve a submitted draft to a known command (exact name match), or null.
// Bare commands resolve too — /model with no args means "reset to default",
// so there's no missing-args guard.
export const resolveCommand = (draft: string): { command: SlashCommand; args: string } | null => {
  const parsed = parseSlash(draft)
  const command = parsed && SLASH_COMMANDS.find(c => c.name === parsed.name)
  if (!command) return null
  return { command, args: parsed?.args ?? '' }
}
