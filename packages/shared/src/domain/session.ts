import type { Id } from './ids.ts'
import type { Worker } from './worker.ts'

// A Session is one agent conversation pinned to a specific Worker (= machine)
// and to that machine's agent session file. The pinning is non-movable:
// resuming requires the agent's local state file (claude-code:
// `~/.claude/projects/<agentSessionId>.jsonl`; codex: TBD).
//
// `mode` is the collaboration dimension ('worker' | 'skill') and is orthogonal
// to `agentKind` (the agent flavour: 'claude-code' v0; 'codex' later).
//
// `state` is NOT a persisted column. UI uses the derived `SessionView` returned
// by the server, which includes `alive` (worker liveness via worker.machineId)
// + `busy` (derived from the SessionEvent log).
export type SessionMode = 'worker' | 'skill'
export type AgentKind = 'claude-code'

export type Session = {
  id: Id
  projectId: Id
  workerId: Id
  mode: SessionMode
  name: string
  agentKind: AgentKind
  agentSessionId: string
  worktreePath: string
  startedAt: number
  closedAt?: number
  updatedAt: number
}

// Server read endpoints return record + runtime view. The worker object is
// inlined so the client can render worker.name/hostname without a 2nd request.
//
//   alive    — the worker (= machine) is reachable (liveness ping in last 90s)
//   attached — THIS session has a daemon process pinging /sessions/me/heartbeat
//              (alive without attached = machine is up but no one is running
//              this session's daemon; messages would just queue)
//   busy     — session is currently processing a turn (turn_start with no
//              trailing turn_complete / turn_error in the event log)
export type SessionView = Session & {
  alive: boolean
  attached: boolean
  busy: boolean
  worker: Worker
}
