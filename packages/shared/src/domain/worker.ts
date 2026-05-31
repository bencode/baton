import type { Id } from './ids.ts'

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
  machineId: string
  name: string
  hostname: string
  createdAt: number
}

// Server merges DB row + in-memory liveness when serving over HTTP.
export type WorkerView = Worker & { alive: boolean }

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
