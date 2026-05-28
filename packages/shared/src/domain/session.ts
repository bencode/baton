import type { Code, Id } from './ids.ts'

// A Session is one Claude Code conversation. claudeSessionId is a UUID baton
// generates at creation time and passes to the CLI as --session-id (first
// turn) / --resume (subsequent turns). worktreePath is provisioned by the
// CLI at `baton session new`. state serialises turns: only one claude
// subprocess at a time per session.
export type SessionMode = 'worker' | 'skill'
export type SessionState = 'idle' | 'busy' | 'closed'

export type Session = {
  id: Id
  projectId: Id
  code: Code // 'S-1'
  mode: SessionMode
  name: string
  state: SessionState
  claudeSessionId?: string
  worktreePath?: string
  startedAt: number
  heartbeatAt: number
  closedAt?: number
}
