import type { Id, SessionView, WorkerView } from '@baton/shared'

// Keep the rail scannable when a worker owns many sessions: active first, then
// recent inactive; collapse the long inactive tail behind a toggle.
export const VISIBLE_BUDGET = 10
const isLive = (s: SessionView): boolean => s.busy || s.attached
export const orderSessions = (sessions: SessionView[]): SessionView[] => {
  const live = sessions.filter(isLive)
  const idle = sessions.filter(s => !isLive(s)).sort((a, b) => b.id - a.id)
  return [...live, ...idle]
}

// Worker grouping by FK: Session.workerId === Worker.id. Schema guarantees
// every session has a worker (M2.6.1 FK Cascade). Destroyed sessions are
// physically gone — they don't appear in the list at all.
export const groupByWorker = (
  workers: WorkerView[],
  sessions: SessionView[],
): { worker: WorkerView; sessions: SessionView[] }[] => {
  const buckets = new Map<Id, SessionView[]>()
  for (const w of workers) buckets.set(w.id, [])
  for (const s of sessions) buckets.get(s.workerId)?.push(s)
  return workers.map(w => ({ worker: w, sessions: buckets.get(w.id) ?? [] }))
}
