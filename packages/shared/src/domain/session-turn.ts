import type { Id } from './ids.ts'
import type { AgentKind } from './session.ts'
import type { SessionEvent } from './session-event.ts'
import type { UserMessagePayload } from './session-input.ts'

export type TurnStatus = 'running' | 'recovering' | 'completed' | 'failed' | 'aborted'
export type AttemptStatus = 'running' | 'stopping' | 'completed' | 'failed' | 'aborted'
export type StopReason =
  | 'interrupt'
  | 'session_stop'
  | 'context_clear'
  | 'lease_expired'
  | 'timeout'
export type Turn = {
  id: Id
  sessionId: Id
  userEventSequence: number
  status: TurnStatus
  createdAt: number
  finishedAt: number | null
}
export type AttemptResult = {
  outcome: 'completed' | 'failed' | 'aborted'
  message?: string
  subtype?: string
  retrying?: boolean
}
export type FinishInput = { runnerToken: string } & Omit<AttemptResult, 'retrying'>
export type Attempt = {
  id: Id
  turnId: Id
  number: number
  claimId: string
  runnerToken: string
  status: AttemptStatus
  leaseUntil: number
  stopReason: StopReason | null
  stopRequestedAt: number | null
  startedAt: number
  finishedAt: number | null
  result: AttemptResult | null
}
export type RunConfig = { agentKind: AgentKind; agentSessionId: string; worktreePath: string }
export type UserMessage = SessionEvent & { type: 'user_message'; payload: UserMessagePayload }
export type ClaimedExecution = {
  kind: 'execute'
  turn: Turn
  attempt: Attempt
  message: UserMessage
  config: RunConfig
}
export type ClaimResult =
  | { kind: 'idle' }
  | ClaimedExecution
  | { kind: 'settled'; attemptId: Id; result: AttemptResult }
  | { kind: 'stopping'; attemptId: Id }
export type ClaimInput = { claimId: string; runnerToken: string }
export type ExecutionState = {
  paused: boolean
  contextResetRequested: boolean
  pendingCount: number
  turn: Turn | null
  attempt: Attempt | null
}
export type HeartbeatResult = { abortRequested: boolean; leaseUntil: number }
