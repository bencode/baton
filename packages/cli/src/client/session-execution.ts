import type {
  AttemptResult,
  ClaimInput,
  ClaimResult,
  ExecutionState,
  FinishInput,
  HeartbeatResult,
  SessionEvent,
} from '@baton/shared'
import { HttpError, request } from './request.ts'
import { withRetry } from './retry.ts'

export type AttemptClient = {
  emitEvent(type: 'agent_event' | 'sdk_event', payload: unknown): Promise<SessionEvent>
  heartbeat(stopReason?: 'timeout'): Promise<HeartbeatResult>
  finish(input: Omit<FinishInput, 'runnerToken'>): Promise<AttemptResult>
  materialize(input: { agentSessionId: string; worktreePath: string }): Promise<unknown>
}
export type ExecutionClient = {
  claim(input: ClaimInput): Promise<ClaimResult>
  state(): Promise<ExecutionState>
  stopped(attemptId: number, runnerToken: string): Promise<AttemptResult>
  forAttempt(attemptId: number, runnerToken: string): AttemptClient
}

// HTTP errors representing a rejected identity are permanent, not transport failures.
const retry = async <T>(call: () => Promise<T>): Promise<T> => {
  const result = await withRetry(async () => {
    try {
      return { value: await call() }
    } catch (error) {
      if (error instanceof HttpError && error.status >= 400 && error.status < 500) return { error }
      throw error
    }
  })
  if ('error' in result) throw result.error
  return result.value
}

export const sessionExecutionClient = (
  baseUrl: string,
  sessionId: number,
  headers?: Record<string, string>,
): ExecutionClient => {
  const base = `${baseUrl}/sessions/${sessionId}`
  const post = <T>(path: string, body: unknown): Promise<T> =>
    request(`${base}${path}`, { method: 'POST', body, headers })
  return {
    claim: input => retry(() => post<ClaimResult>('/turns/claim', input)),
    state: () => request(`${base}/execution`, { method: 'GET', headers }),
    stopped: (attemptId, runnerToken) =>
      retry(() => post<AttemptResult>(`/attempts/${attemptId}/stopped`, { runnerToken })),
    forAttempt: (attemptId, runnerToken) => {
      const path = `/attempts/${attemptId}`
      return {
        emitEvent: (type, payload) => post(`${path}/events`, { runnerToken, type, payload }),
        heartbeat: stopReason => post(`${path}/heartbeat`, { runnerToken, stopReason }),
        finish: input =>
          retry(() => post<AttemptResult>(`${path}/finish`, { ...input, runnerToken })),
        materialize: input =>
          retry(() =>
            post(`${path}/materialize`, {
              runnerToken,
              agentSessionId: input.agentSessionId,
            }),
          ),
      }
    },
  }
}
