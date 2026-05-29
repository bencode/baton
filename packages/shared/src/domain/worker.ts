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
