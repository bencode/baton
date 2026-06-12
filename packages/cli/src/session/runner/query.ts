import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { SessionConfig } from '../../project-config.ts'
import { additionalDirs, buildSdkEnv, claudeExecutable } from './sdk-env.ts'

// Injection seam for tests: the real `query` returns a Query (an
// AsyncGenerator<SDKMessage>); a fake just needs to be an async-iterable of
// messages. Kept structural so `query` is assignable without a cast.
export type QueryFn = (params: { prompt: string; options?: Options }) => AsyncIterable<SDKMessage>

// Start one turn through the SDK. Mirrors the old buildClaudeArgs/spawn:
//   - cwd: the session worktree (isolation, unchanged)
//   - sessionId vs resume: first turn presets our own UUID (= CLI --session-id),
//     later turns resume it (= CLI --resume) — keeps transcript/title lookups working
//   - bypassPermissions: behaviour-identical to --dangerously-skip-permissions
//   - planMode: the web /plan command — run this turn read-only ('plan'), so the
//     agent proposes a plan (via ExitPlanMode) without touching files; the user
//     then sends a normal message to execute. The SDK enforces read-only.
//   - model: the web /model command — per-session model override, passed
//     verbatim to the SDK; unset = the CLI default model.
//   - abortController: the watchdog aborts it to kill an overrunning turn
export type TurnOverrides = {
  envOverlay?: Record<string, string>
  planMode?: boolean
  model?: string
}

export const startQuery = (
  config: SessionConfig,
  text: string,
  resuming: boolean,
  queryFn: QueryFn,
  abortController: AbortController,
  log: (m: string) => void,
  { envOverlay, planMode = false, model }: TurnOverrides = {},
): AsyncIterable<SDKMessage> => {
  const env = buildSdkEnv(envOverlay)
  const exe = claudeExecutable()
  const addDirs = additionalDirs()
  if (addDirs) log(`[add-dir] ${addDirs.join(', ')}`)
  if (planMode) log('[plan] read-only planning turn')
  if (model) log(`[model] ${model}`)
  const options: Options = {
    cwd: config.worktreePath,
    permissionMode: planMode ? 'plan' : 'bypassPermissions',
    includePartialMessages: false,
    abortController,
    stderr: line => log(`[claude] ${line.trimEnd()}`),
    ...(resuming ? { resume: config.agentSessionId } : { sessionId: config.agentSessionId }),
    ...(env ? { env } : {}),
    ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
    ...(addDirs ? { additionalDirectories: addDirs } : {}),
    ...(model ? { model } : {}),
  }
  return queryFn({ prompt: text, options })
}
