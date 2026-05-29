import type { Id } from './ids.ts'

// A Worker is a registered (project × machine) presence. Identified by
// `machineId` (UUID baton lazily writes to ~/.local/share/baton/machine-id)
// + `name` (human handle for display). Sessions do NOT FK to Worker —
// they snapshot machineId, hostname, workerName as strings and group by
// matching machineId in the UI. Liveness is derived from in-memory
// heartbeats, never persisted.
export type Worker = {
  id: Id
  projectId: Id
  machineId: string
  name: string
  hostname: string
  startedAt: number
  closedAt?: number
}

// Server merges DB row + in-memory liveness when serving over HTTP.
export type WorkerView = Worker & { alive: boolean }
