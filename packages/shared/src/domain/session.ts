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
// Lifecycle is intentionally minimal — the row exists or doesn't. Destroyed
// sessions are physically DELETEd (cascade to SessionEvent); there's no
// soft-delete / closedAt. Daemon attach state (`attached`) and turn activity
// (`busy`) are runtime signals on SessionView, not session state.
export type SessionMode = 'worker' | 'skill'
export type AgentKind = 'claude-code'

// `agentSessionId` and `worktreePath` are null between creation and
// materialization: a session row is created remotely (just project/worker/name),
// then the owning Worker mints the agent session id + git worktree and fills
// them in. Both are non-null once the Worker has materialized the session.
export type Session = {
  id: Id
  projectId: Id
  workerId: Id
  mode: SessionMode
  name: string
  agentKind: AgentKind
  agentSessionId: string | null
  worktreePath: string | null
  createdAt: number
  updatedAt: number
}

// Server read endpoints return record + runtime view. The worker object is
// inlined so the client can render worker.name/hostname without a 2nd request.
//
//   alive    — the worker (= machine) is reachable (liveness ping in last 90s)
//   attached — THIS session has a daemon process pinging /sessions/me/heartbeat.
//              Diagnostic only — UI doesn't render this as a session state.
//   busy     — currently processing a turn (turn_start with no trailing close
//              event). Treated as a transient event in UI (pulse), not state.
export type SessionView = Session & {
  alive: boolean
  attached: boolean
  busy: boolean
  worker: Worker
}
