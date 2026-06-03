import { query, type Options, type SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { SessionConfig } from '../../project-config.ts'
import { buildSdkEnv, claudeExecutable } from './sdk-env.ts'

// Injection seam for tests: the real `query` returns a Query (an
// AsyncGenerator<SDKMessage>); a fake just needs to be an async-iterable of
// messages. Kept structural so `query` is assignable without a cast.
export type QueryFn = (params: {
  prompt: string
  options?: Options
}) => AsyncIterable<SDKMessage>

// Start one turn through the SDK. Mirrors the old buildClaudeArgs/spawn:
//   - cwd: the session worktree (isolation, unchanged)
//   - sessionId vs resume: first turn presets our own UUID (= CLI --session-id),
//     later turns resume it (= CLI --resume) — keeps transcript/title lookups working
//   - bypassPermissions: behaviour-identical to --dangerously-skip-permissions
//     (a real permission policy via canUseTool is the deliberate next step)
//   - abortController: the watchdog aborts it to kill an overrunning turn
export const startQuery = (
  config: SessionConfig,
  text: string,
  resuming: boolean,
  queryFn: QueryFn,
  abortController: AbortController,
  log: (m: string) => void,
  envOverlay?: Record<string, string>,
): AsyncIterable<SDKMessage> => {
  const env = buildSdkEnv(envOverlay)
  const exe = claudeExecutable()
  const options: Options = {
    cwd: config.worktreePath,
    permissionMode: 'bypassPermissions',
    includePartialMessages: false,
    abortController,
    stderr: line => log(`[claude] ${line.trimEnd()}`),
    ...(resuming ? { resume: config.agentSessionId } : { sessionId: config.agentSessionId }),
    ...(env ? { env } : {}),
    ...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
  }
  return queryFn({ prompt: text, options })
}
