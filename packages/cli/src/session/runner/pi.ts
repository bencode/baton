import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { type AgentEvent, type AgentItem, type AgentUsage, isAgentEffort } from '@baton/shared'
import type { AgentSession, AgentSessionEvent, ModelRuntime } from '@earendil-works/pi-coding-agent'
import { contentTypeForPath } from '../../mime.ts'
import type { SessionConfig } from '../../project-config.ts'
import type { CodexInput } from './codex.ts'
import { PLAN_MODE_PREFIX } from './sdk-env.ts'

type PiMessage = Extract<AgentSessionEvent, { type: 'message_end' }>['message']
type PiAssistantMessage = Extract<PiMessage, { role: 'assistant' }>
type PiImages = NonNullable<Parameters<AgentSession['prompt']>[1]>['images']

export type PiRunOptions = {
  planMode?: boolean
  model?: string
  effort?: string
  signal?: AbortSignal
  log: (m: string) => void
}

// Per-turn fold state. Tool args are remembered from tool_execution_start because
// tool_execution_end does not repeat them, and the completed item replaces the
// started one (keyed by id) in every consumer.
export type PiTurnState = {
  startedAt: number
  usage: AgentUsage
  error?: string
  toolArgs: Record<string, unknown>
}

export const newPiTurnState = (startedAt = Date.now()): PiTurnState => ({
  startedAt,
  usage: {},
  toolArgs: {},
})

const READ_ONLY_TOOLS = ['read', 'grep', 'find', 'ls']

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

const resultText = (result: unknown): string =>
  isRecord(result) && Array.isArray(result.content)
    ? result.content
        .filter(isRecord)
        .map(block => str(block.text) ?? '')
        .join('')
    : ''

const startedItem = (id: string, name: string, args: unknown): AgentItem => {
  const input = isRecord(args) ? args : {}
  if (name === 'bash') {
    return {
      type: 'command_execution',
      id,
      status: 'in_progress',
      command: str(input.command) ?? '',
      output: '',
    }
  }
  if (name === 'write' || name === 'edit') {
    return {
      type: 'file_change',
      id,
      status: 'in_progress',
      changes: [{ path: str(input.path) ?? '', kind: 'update' }],
    }
  }
  return { type: 'tool_call', id, status: 'in_progress', name, input: args ?? null }
}

const completedItem = (
  id: string,
  name: string,
  args: unknown,
  result: unknown,
  isError: boolean,
): AgentItem => {
  const status = isError ? 'failed' : 'completed'
  const started = startedItem(id, name, args)
  if (started.type === 'command_execution') {
    const structured =
      isRecord(result) && isRecord(result.structuredContent) ? result.structuredContent : {}
    return {
      ...started,
      status,
      output: str(structured.output) ?? resultText(result),
      exitCode: typeof structured.exit_code === 'number' ? structured.exit_code : undefined,
    }
  }
  if (started.type === 'tool_call') {
    return { ...started, status, output: resultText(result), isError }
  }
  return { ...started, status }
}

const messageItems = (message: PiAssistantMessage): AgentItem[] =>
  message.content.flatMap((block, index): AgentItem[] => {
    const id = `${message.responseId ?? message.timestamp}:${index}`
    if (block.type === 'text' && block.text.trim()) {
      return [{ type: 'agent_message', id, status: 'completed', text: block.text }]
    }
    if (block.type === 'thinking' && block.thinking.trim()) {
      return [{ type: 'reasoning', id, status: 'completed', text: block.thinking }]
    }
    return []
  })

const addUsage = (total: AgentUsage, usage: PiAssistantMessage['usage']): AgentUsage => ({
  inputTokens: (total.inputTokens ?? 0) + usage.input,
  cachedInputTokens: (total.cachedInputTokens ?? 0) + usage.cacheRead,
  outputTokens: (total.outputTokens ?? 0) + usage.output,
  reasoningOutputTokens: (total.reasoningOutputTokens ?? 0) + (usage.reasoning ?? 0),
  totalCostUsd: (total.totalCostUsd ?? 0) + usage.cost.total,
  numTurns: (total.numTurns ?? 0) + 1,
})

// Fold one pi session event into Baton AgentEvents. Only completed messages and
// tool boundaries are emitted: streaming deltas each carry the whole partial
// message (and agent_end the system prompt), so forwarding them would multiply
// emit calls and stored payload size for no rendering gain.
export const piToAgentEvents = (
  event: AgentSessionEvent,
  state: PiTurnState,
  now = Date.now(),
): { events: AgentEvent[]; state: PiTurnState } => {
  if (event.type === 'tool_execution_start') {
    return {
      events: [
        { type: 'item.started', item: startedItem(event.toolCallId, event.toolName, event.args) },
      ],
      state: { ...state, toolArgs: { ...state.toolArgs, [event.toolCallId]: event.args } },
    }
  }
  if (event.type === 'tool_execution_end') {
    const args = state.toolArgs[event.toolCallId]
    return {
      events: [
        {
          type: 'item.completed',
          item: completedItem(event.toolCallId, event.toolName, args, event.result, event.isError),
        },
      ],
      state,
    }
  }
  if (event.type === 'message_end' && event.message.role === 'assistant') {
    const message = event.message
    return {
      events: messageItems(message).map(item => ({ type: 'item.completed' as const, item })),
      // Reset on every assistant message: pi auto-retries, and only the last
      // response decides whether the turn failed.
      state: {
        ...state,
        usage: addUsage(state.usage, message.usage),
        error:
          message.stopReason === 'error' ? (message.errorMessage ?? 'pi turn failed') : undefined,
      },
    }
  }
  if (event.type === 'agent_settled') {
    const usage = { ...state.usage, durationMs: now - state.startedAt }
    return {
      events: [
        state.error
          ? { type: 'turn.failed', error: { message: state.error }, usage }
          : { type: 'turn.completed', usage },
      ],
      state,
    }
  }
  return { events: [], state }
}

const resolveModel = (runtime: ModelRuntime, raw: string) => {
  const slash = raw.indexOf('/')
  const model = slash > 0 ? runtime.getModel(raw.slice(0, slash), raw.slice(slash + 1)) : undefined
  if (!model) throw new Error(`unknown pi model "${raw}" (expected provider/model)`)
  return model
}

const promptParts = async (input: CodexInput): Promise<{ text: string; images: PiImages }> => {
  if (typeof input === 'string') return { text: input, images: [] }
  const text = input.flatMap(entry => (entry.type === 'text' ? [entry.text] : [])).join('\n')
  const images = await Promise.all(
    input.flatMap(entry =>
      entry.type === 'local_image'
        ? [
            readFile(entry.path).then(data => ({
              type: 'image' as const,
              data: data.toString('base64'),
              mimeType: contentTypeForPath(entry.path),
            })),
          ]
        : [],
    ),
  )
  return { text, images }
}

// Start one turn in-process. The session id is minted by Baton (like claude-code):
// the first turn creates pi's session file under that id, later turns reopen it.
// Credentials come from the worker env (DEEPSEEK_API_KEY, ZAI_CODING_CN_API_KEY, …)
// or ~/.pi/agent/auth.json; an unset model falls back to the session's recorded
// model, then pi's defaultProvider/defaultModel settings.
export async function* startPiEvents(
  config: SessionConfig,
  input: CodexInput,
  opts: PiRunOptions,
): AsyncIterable<AgentEvent> {
  const pi = await import('@earendil-works/pi-coding-agent')
  const modelRuntime = await pi.ModelRuntime.create()
  const model = opts.model ? resolveModel(modelRuntime, opts.model) : undefined
  const thinkingLevel = isAgentEffort(opts.effort) ? opts.effort : undefined
  const agentDir = pi.getAgentDir()
  const resourceLoader = new pi.DefaultResourceLoader({
    cwd: config.cwd,
    agentDir,
    // pi discovers .pi/ and .agents/ skills natively; Baton workers deploy theirs
    // under .claude/skills (project and user level).
    additionalSkillPaths: [join(config.cwd, '.claude/skills'), join(homedir(), '.claude/skills')],
  })
  await resourceLoader.reload()
  const existing = pi.SessionManager.findById(config.cwd, config.agentSessionId)
  const sessionManager = existing
    ? pi.SessionManager.open(existing)
    : pi.SessionManager.create(config.cwd, undefined, { id: config.agentSessionId })
  const { session } = await pi.createAgentSession({
    cwd: config.cwd,
    agentDir,
    modelRuntime,
    resourceLoader,
    sessionManager,
    ...(model ? { model } : {}),
    ...(thinkingLevel ? { thinkingLevel } : {}),
    ...(opts.planMode ? { tools: READ_ONLY_TOOLS } : {}),
  })
  const modelId = session.model ? `${session.model.provider}/${session.model.id}` : undefined
  opts.log(`[pi] ${existing ? 'resume' : 'new'} session ${session.sessionId}`)
  if (modelId) opts.log(`[model] ${modelId}`)
  if (thinkingLevel) opts.log(`[effort] ${thinkingLevel}`)
  if (opts.planMode) opts.log('[plan] read-only tools')

  const queue: AgentSessionEvent[] = []
  let wake: () => void = () => {}
  let failure: unknown
  let finished = false
  let settled = false
  const unsubscribe = session.subscribe(event => {
    queue.push(event)
    wake()
  })
  const abort = (): void => {
    void session.abort().catch(error => opts.log(`[pi] abort: ${String(error)}`))
  }
  opts.signal?.addEventListener('abort', abort, { once: true })
  try {
    yield { type: 'thread.started', sessionId: session.sessionId, model: modelId }
    yield { type: 'turn.started' }
    const { text, images } = await promptParts(input)
    // An abort during setup fired before the listener existed (or hit an idle
    // agent); don't start the run at all — runTurn reports it as aborted.
    if (opts.signal?.aborted) return
    const running = session
      .prompt(opts.planMode ? `${PLAN_MODE_PREFIX}${text}` : text, images?.length ? { images } : {})
      .then(
        () => {
          finished = true
          wake()
        },
        error => {
          failure = error
          wake()
        },
      )
    let state = newPiTurnState()
    while (!settled) {
      const event = queue.shift()
      if (!event) {
        if (failure !== undefined) throw failure
        // prompt() resolved without settling (e.g. an extension handled the input):
        // stop here and let runTurn report "agent produced no result".
        if (finished) break
        await new Promise<void>(resolve => {
          wake = resolve
        })
        continue
      }
      const folded = piToAgentEvents(event, state)
      state = folded.state
      settled = event.type === 'agent_settled'
      yield* folded.events
    }
    await running
    // pi emits agent_settled before prompt() rejects, so a failure can land
    // after the loop has already seen the settle.
    if (failure !== undefined) throw failure
  } finally {
    opts.signal?.removeEventListener('abort', abort)
    unsubscribe()
    session.dispose()
  }
}
