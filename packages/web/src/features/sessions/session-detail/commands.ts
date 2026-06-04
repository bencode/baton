// Slash commands for the session composer (Claude-Code style). Typing "/<name>"
// in the input runs a command instead of sending a normal message. The registry
// feeds both the autocomplete menu and the submit handler; new commands (e.g.
// /model once the worker takes --model) are just another entry here.
export type SlashKind = 'help' | 'clear' | 'plan' | 'abort'

export type SlashCommand = {
  name: string
  kind: SlashKind
  desc: string
  takesArgs?: boolean // /plan <task> — keep typing after picking it
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', kind: 'help', desc: 'show available commands' },
  { name: 'clear', kind: 'clear', desc: 'reset the conversation (keeps session + code)' },
  { name: 'abort', kind: 'abort', desc: 'interrupt the running turn (like Esc)' },
  {
    name: 'plan',
    kind: 'plan',
    desc: 'read-only planning — propose a plan, no file edits',
    takesArgs: true,
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

// Commands to show in the menu — only while typing the name (no space yet),
// filtered by the prefix. Empty = menu hidden.
export const matchCommands = (draft: string): SlashCommand[] => {
  if (!draft.startsWith('/') || /\s/.test(draft)) return []
  const q = draft.slice(1).toLowerCase()
  return SLASH_COMMANDS.filter(c => c.name.startsWith(q))
}

// Resolve a submitted draft to a known command (exact name match), or null.
// A command that takes args needs them — a bare "/plan" resolves to null so
// Enter falls through to a newline instead of firing an empty command.
export const resolveCommand = (draft: string): { command: SlashCommand; args: string } | null => {
  const parsed = parseSlash(draft)
  const command = parsed && SLASH_COMMANDS.find(c => c.name === parsed.name)
  if (!command) return null
  if (command.takesArgs && !parsed?.args) return null
  return { command, args: parsed?.args ?? '' }
}
