import type { Project } from './project.ts'
import type { Session } from './session.ts'
import type { Worker } from './worker.ts'
import type { Workspace } from './workspace.ts'

// Fleet-wide snapshot for the admin ops board (web /ops): every workspace →
// project → worker → session as flat lists keyed by ids, so the client groups
// freely without N+1 joins. Workers carry the live `alive` flag; sessions
// carry `attached`/`busy` from the server's in-memory trackers. Cross-workspace
// by design — served only behind requireAdmin.
export type AdminOverview = {
  workspaces: Workspace[]
  projects: Project[]
  workers: (Worker & { alive: boolean; connected: boolean })[]
  sessions: (Session & { attached: boolean; busy: boolean })[]
}
