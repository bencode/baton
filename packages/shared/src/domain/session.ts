import type { Id } from './ids.ts'

// A Session is one Claude Code conversation. claudeSessionId is a UUID baton
// generates at creation time and passes to the CLI as --session-id (first
// turn) / --resume (subsequent turns). worktreePath is provisioned by the
// CLI at `baton session new`.
//
// `machineId` / `hostname` / `workerName` are snapshot strings — they
// describe the machine that hosted the daemon at creation time. UI groups
// sessions by these snapshots; there is intentionally no Worker FK.
//
// `state` is NOT a persisted column anymore. UI uses the derived
// `SessionView` returned by the server, which includes `alive` (from worker
// liveness via machineId) + `busy` (derived from the SessionEvent log).
export type SessionMode = 'worker' | 'skill'

export type Session = {
  id: Id
  projectId: Id
  mode: SessionMode
  name: string
  claudeSessionId?: string
  worktreePath?: string
  machineId?: string
  hostname?: string
  workerName?: string
  startedAt: number
  closedAt?: number
}

// What the server actually returns for read endpoints — record + runtime view.
export type SessionView = Session & { alive: boolean; busy: boolean }
