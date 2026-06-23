import type { AdminOverview } from '@baton/shared'
import type { OpsSession } from '../session-card'

export type OpsWorker = AdminOverview['workers'][number]

// One wall section = one project: its workers' health in the header, its
// attached sessions as cards (working first, then most recently active).
export type Section = {
  key: number
  title: string
  workers: OpsWorker[]
  cards: OpsSession[]
  dormant: number
}

export const sessionOrder = (a: OpsSession, b: OpsSession): number =>
  Number(b.busy) - Number(a.busy) || b.lastActiveAt - a.lastActiveAt

export const toSections = (data: AdminOverview): Section[] => {
  const workspaces = new Map(data.workspaces.map(w => [w.id, w]))
  return data.projects
    .map(p => {
      const workers = data.workers.filter(w => w.projectId === p.id)
      const sessions = data.sessions.filter(s => s.projectId === p.id)
      const ws = workspaces.get(p.workspaceId)
      return {
        key: p.id,
        title: `${ws ? `${ws.name} / ` : ''}${p.name}`.toUpperCase(),
        workers,
        cards: sessions.filter(s => s.attached).sort(sessionOrder),
        dormant: sessions.filter(s => !s.attached).length,
      }
    })
    .filter(s => s.workers.length > 0)
    .sort(
      (a, b) =>
        b.cards.filter(c => c.busy).length - a.cards.filter(c => c.busy).length ||
        b.cards.length - a.cards.length ||
        a.key - b.key,
    )
}

export type OpsStats = { busy: number; idle: number; offline: number }

// Fleet headline counts. `offline` uses each worker's own `connected` flag (its
// daemon is streaming now), not the shared machineId heartbeat — so a registered
// but not-running worker reads as offline.
export const computeStats = (data: AdminOverview | null): OpsStats => {
  const busy = data?.sessions.filter(s => s.busy).length ?? 0
  const idle = (data?.sessions.filter(s => s.attached).length ?? 0) - busy
  const offline = data?.workers.filter(w => !w.connected).length ?? 0
  return { busy, idle, offline }
}
