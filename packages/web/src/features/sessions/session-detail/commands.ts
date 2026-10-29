import { type AgentEffort, type AgentKind, parseEffort } from '@baton/shared'

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

// Curated "/model <name> [effort]" presets, per agent. A session's agentKind is
// inherited from its worker and can't be overridden, so the menu never has to ask
// which provider you meant — it only ever offers that session's own models. These
// are hints, not a whitelist: any name/effort typed out still passes through.
const MODEL_SUGGESTIONS: Record<AgentKind, string[]> = {
  'claude-code': [
    'opus',
    'opus xhigh',
    'opus max',
    'sonnet',
    'sonnet high',
    'haiku',
    'fable',
    'glm-5.3-flash[1m]',
  ],
  codex: [
    'gpt-6.1-sol',
    'gpt-6.1-sol ultra',
    'gpt-6.1-terra',
    'gpt-6-astra',
    'gpt-6-sol',
    'gpt-6-luna',
  ],
  // pi addresses models as provider/model.
  pi: [
    'deepseek/deepseek-v4-pro',
    'deepseek/deepseek-flash',
    'zai-coding-cn/glm-5.3',
    'zai-coding-cn/glm-5.3 high',
    'zai-coding-cn/glm-5.3-flash',
  ],
}

export const slashCommands = (kind: AgentKind): SlashCommand[] => [
  { name: 'help', kind: 'help', desc: '查看可用命令' },
  { name: 'clear', kind: 'clear', desc: '重置上下文，保留历史和待发送消息' },
  { name: 'abort', kind: 'abort', desc: '停止当前执行（Esc）' },
  { name: 'plan', kind: 'plan', desc: '切换规划模式，只读分析，不修改文件' },
  {
    name: 'model',
    kind: 'model',
    desc: '设置模型和思考强度；直接执行 /model 恢复默认',
    takesArgs: true,
    argSuggestions: MODEL_SUGGESTIONS[kind],
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

// "/model" args → the model + effort override. Grammar is "<name> [effort]": a
// lone token is always the model, never an effort, so the two can't be confused.
// Both null = bare /model = reset. A trailing token that isn't a known effort
// stays part of nothing — it's rejected here so a typo ("opus higgh") is visibly
// wrong instead of silently sending model="opus" with no effort.
export type ModelArgs = { model: string | null; effort: AgentEffort | null; error?: string }

export const parseModelArgs = (args: string): ModelArgs => {
  const parts = args.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { model: null, effort: null }
  const [model, rawEffort, ...rest] = parts
  if (!model || rest.length > 0)
    return { model: null, effort: null, error: `模型参数格式错误：${args}` }
  if (rawEffort === undefined) return { model, effort: null }
  const effort = parseEffort(rawEffort)
  return effort
    ? { model, effort }
    : { model: null, effort: null, error: `未知思考强度：${rawEffort}` }
}

// Commands to show in the menu — while typing the name (no space yet), filtered
// by the prefix. Past the name, a command with argSuggestions keeps the menu
// open with arg hints ("/model son" → "model sonnet"); built on parseSlash so
// suggesting and executing agree on what counts as a command line. An arg typed
// out exactly closes the menu, so Enter submits the typed value even when one
// suggestion prefixes another. Empty = menu hidden.
export const matchCommands = (draft: string, kind: AgentKind): SlashCommand[] => {
  if (!draft.startsWith('/')) return []
  if (/\s/.test(draft)) {
    const parsed = parseSlash(draft)
    const command = parsed && slashCommands(kind).find(c => c.name === parsed.name)
    const suggestions = command?.argSuggestions
    if (!parsed || !suggestions || suggestions.includes(parsed.args)) return []
    return suggestions
      .filter(s => s.startsWith(parsed.args))
      .map(s => ({ name: `${command.name} ${s}`, kind: command.kind, desc: '', args: s }))
  }
  const q = draft.slice(1).toLowerCase()
  return slashCommands(kind).filter(c => c.name.startsWith(q))
}

// Resolve a submitted draft to a known command (exact name match), or null.
// Bare commands resolve too — /model with no args means "reset to default",
// so there's no missing-args guard.
export const resolveCommand = (
  draft: string,
  kind: AgentKind,
): { command: SlashCommand; args: string } | null => {
  const parsed = parseSlash(draft)
  const command = parsed && slashCommands(kind).find(c => c.name === parsed.name)
  if (!command) return null
  return { command, args: parsed?.args ?? '' }
}

export const modelPresets = (kind: AgentKind): string[] => [
  ...new Set(
    MODEL_SUGGESTIONS[kind].flatMap(value => {
      const { model } = parseModelArgs(value)
      return model ? [model] : []
    }),
  ),
]
