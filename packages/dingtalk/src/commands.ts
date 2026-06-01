import type { BindingStore } from './bindings.ts'
import type { BatonClient } from './client.ts'

// Chat commands (leading "/"). A handler returns the reply to post; the bridge
// does NOT forward the message to the agent. Adding /model, /plan, … later is
// just another entry in HANDLERS.
export type CommandCtx = {
  client: BatonClient
  bindings: BindingStore
  key: string // conversation+sender binding key
  args: string // text after the command word
}

type Handler = (ctx: CommandCtx) => Promise<string>

// /clear — drop the caller's session so the next message starts fresh. claude
// has no headless context-reset (verified against the CLI/SDK), so "clear" =
// stop + unbind → a new session id next turn (destroy + start). stopSession is
// best-effort: the runner may already be down; we unbind either way.
const clear: Handler = async ({ client, bindings, key }) => {
  const id = bindings.get(key)
  if (id === undefined) return '🆕 当前没有会话，直接发消息即可开始。'
  await client.stopSession(id).catch(() => {})
  bindings.delete(key)
  return '🆕 已清空上下文，下一条消息开始新会话。'
}

const HANDLERS: Record<string, Handler> = { clear }

const HELP = ['可用命令：', '/clear — 清空上下文，下条消息开始新会话', '/help — 显示帮助'].join('\n')

// Parse a leading-slash message into { name, args }. null for non-commands.
export const parseCommand = (text: string): { name: string; args: string } | null => {
  const t = text.trim()
  if (!t.startsWith('/')) return null
  const sp = t.indexOf(' ')
  return {
    name: (sp === -1 ? t.slice(1) : t.slice(1, sp)).toLowerCase(),
    args: sp === -1 ? '' : t.slice(sp + 1).trim(),
  }
}

// Run a parsed command. Unknown name or /help → help text.
export const runCommand = async (
  cmd: { name: string; args: string },
  ctx: Omit<CommandCtx, 'args'>,
): Promise<string> => {
  const handler = HANDLERS[cmd.name]
  if (!handler) return HELP
  return handler({ ...ctx, args: cmd.args })
}
