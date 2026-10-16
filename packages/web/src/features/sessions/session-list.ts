import type { Id, SessionView } from '@baton/shared'

type SessionGroup = { label: string; sessions: SessionView[] }

export const buildSessionGroups = (
  sessions: readonly SessionView[],
  filters: { query: string; workerId: Id | null },
  now: number,
): SessionGroup[] => {
  const date = new Date(now)
  const day = (offset: number) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset).getTime()
  const boundaries = [day(0), day(1), day(6)]
  const labels = ['Today', 'Yesterday', 'Previous 7 days', 'Earlier']
  const query = filters.query.trim().toLocaleLowerCase()
  const groups = labels.map(label => ({ label, sessions: [] as SessionView[] }))
  sessions
    .filter(
      session =>
        (filters.workerId === null || session.workerId === filters.workerId) &&
        session.name.toLocaleLowerCase().includes(query),
    )
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt || b.id - a.id)
    .forEach(session => {
      const index = boundaries.findIndex(boundary => session.lastActiveAt >= boundary)
      groups[index < 0 ? 3 : index]?.sessions.push(session)
    })
  return groups.filter(group => group.sessions.length > 0)
}
