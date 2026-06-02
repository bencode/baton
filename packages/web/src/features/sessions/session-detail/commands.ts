// Slash commands for the session composer (Claude-Code style). Typing "/<name>"
// in the input runs a command instead of sending a normal message. The registry
// feeds both the autocomplete menu and the submit handler; new commands (e.g.
// /model once the worker takes --model) are just another entry here.
export type SlashKind = 'help' | 'clear' | 'plan'

export type SlashCommand = {
  name: string
  kind: SlashKind
  desc: string
  takesArgs?: boolean // /plan <task> — keep typing after picking it
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: 'help', kind: 'help', desc: 'show available commands' },
  { name: 'clear', kind: 'clear', desc: 'reset the conversation (keeps session + code)' },
  { name: 'plan', kind: 'plan', desc: 'ask for a plan first, no edits yet', takesArgs: true },
]

// /plan is a prompt convention (claude has no headless plan mode): prepend a
// "plan first, don't touch files" instruction to the user's task.
export const PLAN_PREAMBLE =
  "Give me an implementation plan and the steps first; don't change any files until I confirm. Task: "

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
export const resolveCommand = (draft: string): { command: SlashCommand; args: string } | null => {
  const parsed = parseSlash(draft)
  const command = parsed && SLASH_COMMANDS.find(c => c.name === parsed.name)
  return command ? { command, args: parsed?.args ?? '' } : null
}
