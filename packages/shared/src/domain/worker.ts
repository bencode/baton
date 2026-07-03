import type { Id } from './ids.ts'
import type { AgentKind } from './session.ts'

// A Worker is a registered (project × machine) presence. Identified by
// `machineId` (UUID baton lazily writes to ~/.local/share/baton/machine-id)
// + `name` (human handle for display). Sessions FK to Worker (Cascade);
// destroying a worker takes its sessions + events with it.
//
// Lifecycle: row exists or doesn't (no soft delete). Runtime liveness is
// derived from in-memory heartbeats, never persisted.
export type Worker = {
  id: Id
  projectId: Id
  agentKind: AgentKind
  machineId: string
  name: string
  hostname: string
  createdAt: number
}

// Server merges DB row + in-memory runtime signals when serving over HTTP.
//   connected — THIS worker's daemon is holding its command stream right now
//               (per-worker, accurate). A registered-but-not-running worker is
//               connected=false. This is the sole "is the worker usable" signal;
//               the old machineId heartbeat (`alive`) was dropped — it was shared
//               across same-machine workers and so lied about a dead sibling.
export type WorkerView = Worker & { connected: boolean }

// Commands the server pushes to a Worker over its SSE command stream
// (GET /workers/me/stream). The Worker is a persistent listener that
// starts / stops / tears down Session child processes in response.
//   start  — materialize if needed + spawn the child (covers create and resume)
//   stop   — kill the child, keep the row + worktree (session goes inactive)
//   delete — kill the child + remove the worktree (server drops the row)
export type WorkerCommand =
  | { cmd: 'session.start'; sessionId: Id; name: string }
  | { cmd: 'session.stop'; sessionId: Id }
  // worktreePath carried so the worker can remove it even if it isn't currently
  // tracking a child for this session (e.g. delete after a worker restart).
  | { cmd: 'session.delete'; sessionId: Id; worktreePath: string | null }
  // Auto-title (frontend-triggered after the first turn): the worker reads the
  // session's own transcript for context and generates a short name. Carries the
  // ids it needs to locate the transcript + run the throwaway claude call.
  | { cmd: 'session.title'; sessionId: Id; agentSessionId: string; worktreePath: string }
  // Interactive terminal: open spawns `claude --resume` in a node-pty in the
  // session's worktree and dials an outbound WS back to the server (human-in-the-
  // loop, alongside the headless relay); close drops that WS, which kills the pty.
  // open carries the ids the worker needs to spawn so it doesn't have to re-fetch
  // (no await before reserving its slot — closes a spawn race).
  | {
      cmd: 'session.terminal'
      sessionId: Id
      action: 'open'
      agentSessionId: string
      worktreePath: string
    }
  | { cmd: 'session.terminal'; sessionId: Id; action: 'close' }
