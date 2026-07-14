import type { AgentEvent, AgentItem, AgentUsage } from '@baton/shared'
import { Codex, type Input, type ThreadOptions } from '@openai/codex-sdk'
import type { WorkerClient } from '../../client.ts'
import type { SessionConfig } from '../../project-config.ts'
import {
  additionalDirs,
  buildSdkEnv,
  codexApprovalPolicy,
  codexEffort,
  codexNetworkAccess,
  codexSandboxMode,
} from './sdk-env.ts'

export type CodexInput = Input

export type CodexRunOptions = {
  envOverlay?: Record<string, string>
  planMode?: boolean
  model?: string
  effort?: string
  signal?: AbortSignal
  log: (m: string) => void
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const compactEnv = (
  env: Record<string, string | undefined> | undefined,
): Record<string, string> | undefined => {
  if (!env) return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) out[key] = value
  }
  return out
}

const statusOf = (v: unknown): AgentItem['status'] =>
  v === 'in_progress' || v === 'failed' || v === 'completed' ? v : 'completed'

const itemId = (item: Record<string, unknown>): string =>
  str(item.id) ?? `${str(item.type) ?? 'item'}-${Math.random().toString(36).slice(2)}`

const todoItems = (raw: unknown): Array<{ text: string; completed: boolean }> =>
  Array.isArray(raw)
    ? raw.filter(isRecord).map(todo => ({
        text: str(todo.text) ?? str(todo.content) ?? '',
        completed: todo.completed === true || todo.status === 'completed',
      }))
    : []

const fileKind = (v: unknown): 'add' | 'update' | 'delete' =>
  v === 'add' || v === 'delete' || v === 'update' ? v : 'update'

const toAgentItem = (raw: unknown): AgentItem => {
  if (!isRecord(raw)) {
    return {
      type: 'error',
      id: 'bad-item',
      status: 'failed',
      message: 'codex item was not an object',
    }
  }
  const type = str(raw.type)
  const id = itemId(raw)
  const status = statusOf(raw.status)
  if (type === 'agent_message') {
    return { type, id, status, text: str(raw.text) ?? str(raw.message) ?? '' }
  }
  if (type === 'reasoning') {
    return { type, id, status, text: str(raw.text) ?? str(raw.summary) ?? '' }
  }
  if (type === 'command_execution') {
    return {
      type,
      id,
      status,
      command: str(raw.command) ?? '',
      output: str(raw.aggregated_output) ?? str(raw.output) ?? '',
      exitCode: typeof raw.exit_code === 'number' ? raw.exit_code : undefined,
    }
  }
  if (type === 'file_change') {
    const changes = Array.isArray(raw.changes)
      ? raw.changes.filter(isRecord).map(change => ({
          path: str(change.path) ?? '',
          kind: fileKind(change.kind),
        }))
      : []
    return { type, id, status, changes }
  }
  if (type === 'mcp_tool_call') {
    return {
      type,
      id,
      status,
      server: str(raw.server) ?? '',
      tool: str(raw.tool) ?? str(raw.name) ?? '',
      arguments: raw.arguments ?? raw.input ?? null,
      output: raw.result ?? raw.output ?? raw.error,
      isError: raw.is_error === true || raw.error !== undefined,
    }
  }
  if (type === 'web_search') {
    return { type, id, status, query: str(raw.query) ?? '' }
  }
  if (type === 'todo_list') {
    return { type, id, status, items: todoItems(raw.items) }
  }
  if (type === 'error') {
    return { type, id, status: 'failed', message: str(raw.message) ?? 'codex error' }
  }
  return {
    type: 'tool_call',
    id,
    status,
    name: str(raw.name) ?? type ?? 'codex_item',
    input: raw,
    output: raw.output,
  }
}

const usageOf = (raw: unknown): AgentUsage | undefined => {
  if (!isRecord(raw)) return undefined
  return {
    inputTokens: typeof raw.input_tokens === 'number' ? raw.input_tokens : undefined,
    cachedInputTokens:
      typeof raw.cached_input_tokens === 'number' ? raw.cached_input_tokens : undefined,
    outputTokens: typeof raw.output_tokens === 'number' ? raw.output_tokens : undefined,
    reasoningOutputTokens:
      typeof raw.reasoning_output_tokens === 'number' ? raw.reasoning_output_tokens : undefined,
  }
}

const toAgentEvent = (raw: unknown): AgentEvent => {
  if (!isRecord(raw)) return { type: 'raw', raw }
  const type = str(raw.type)
  if (type === 'thread.started') {
    return {
      type,
      sessionId: str(raw.thread_id) ?? str(raw.sessionId) ?? '',
      model: str(raw.model),
      raw,
    }
  }
  if (type === 'turn.started') return { type, raw }
  if (
    (type === 'item.started' || type === 'item.updated' || type === 'item.completed') &&
    raw.item !== undefined
  ) {
    return { type, item: toAgentItem(raw.item), raw }
  }
  if (type === 'turn.completed') return { type, usage: usageOf(raw.usage), raw }
  if (type === 'turn.failed') {
    const error = isRecord(raw.error) ? raw.error : raw
    return { type, error: { message: str(error.message) ?? 'codex turn failed' }, raw }
  }
  if (type === 'error') return { type, message: str(raw.message) ?? 'codex error', raw }
  return { type: 'raw', raw }
}

const withPlanPrefix = (input: CodexInput): CodexInput => {
  const prefix =
    'Plan mode: inspect and propose a plan only. Do not edit files or run mutating commands.\n\n'
  if (typeof input === 'string') return `${prefix}${input}`
  return input.map((entry, i) =>
    i === 0 && entry.type === 'text' ? { ...entry, text: `${prefix}${entry.text}` } : entry,
  )
}

export async function* startCodexEvents(
  config: SessionConfig,
  input: CodexInput,
  worker: WorkerClient,
  opts: CodexRunOptions,
): AsyncIterable<AgentEvent> {
  const env = compactEnv(buildSdkEnv(opts.envOverlay))
  const codex = new Codex(env ? { env } : undefined)
  const resuming = !config.agentSessionId.startsWith('pending:')
  const addDirs = additionalDirs()
  const sandboxMode = codexSandboxMode(opts.planMode ?? false)
  const approvalPolicy = codexApprovalPolicy()
  const networkAccessEnabled = codexNetworkAccess()
  const reasoningEffort = codexEffort(opts.effort)
  opts.log(
    `[codex] sandbox=${sandboxMode} approval=${approvalPolicy}${
      networkAccessEnabled === undefined ? '' : ` network=${networkAccessEnabled}`
    }`,
  )
  if (opts.model) opts.log(`[model] ${opts.model}`)
  if (reasoningEffort) opts.log(`[effort] ${reasoningEffort}`)
  const threadOptions: ThreadOptions = {
    workingDirectory: config.worktreePath,
    skipGitRepoCheck: true,
    sandboxMode,
    approvalPolicy,
    ...(opts.model ? { model: opts.model } : {}),
    ...(reasoningEffort ? { modelReasoningEffort: reasoningEffort } : {}),
    ...(addDirs ? { additionalDirectories: addDirs } : {}),
    ...(networkAccessEnabled === undefined ? {} : { networkAccessEnabled }),
  }
  const thread = resuming
    ? codex.resumeThread(config.agentSessionId, threadOptions)
    : codex.startThread(threadOptions)
  const runInput = opts.planMode ? withPlanPrefix(input) : input
  const { events } = await thread.runStreamed(runInput, {
    ...(opts.signal ? { signal: opts.signal } : {}),
  })
  for await (const raw of events) {
    const event = toAgentEvent(raw)
    if (event.type === 'thread.started' && !resuming && event.sessionId) {
      config.agentSessionId = event.sessionId
      await worker.materialize({
        agentSessionId: event.sessionId,
        worktreePath: config.worktreePath,
      })
      opts.log(`[codex] thread ${event.sessionId}`)
    }
    yield event
  }
}
