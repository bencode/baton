import { API_BASE } from '../../api'

// Project-scoped change stream. One shared EventSource per project (ref-counted
// across every subscriber), carrying invalidation signals — the server tells us
// which resource changed and we refetch that query. Lives as a module singleton
// rather than a context provider so any hook can subscribe regardless of where
// it sits in the tree (the tab-title sync and the rail both need it).
type Resource = 'sessions' | 'workers' | 'tasks' | 'loops'
type Listener = (resource: Resource) => void
type Channel = { es: EventSource; listeners: Set<Listener>; refs: number }

const channels = new Map<number, Channel>()

const acquire = (projectId: number): Channel => {
  const existing = channels.get(projectId)
  if (existing) {
    existing.refs += 1
    return existing
  }
  const listeners = new Set<Listener>()
  const es = new EventSource(`${API_BASE}/projects/${projectId}/stream`)
  es.onmessage = e => {
    try {
      const { resource } = JSON.parse(e.data) as { resource: Resource }
      for (const l of listeners) l(resource)
    } catch {
      // ignore malformed payloads
    }
  }
  const ch: Channel = { es, listeners, refs: 1 }
  channels.set(projectId, ch)
  return ch
}

const release = (projectId: number): void => {
  const ch = channels.get(projectId)
  if (!ch) return
  ch.refs -= 1
  if (ch.refs <= 0) {
    ch.es.close()
    channels.delete(projectId)
  }
}

// Subscribe to one resource's change signals for a project. `onBump` fires each
// time that resource changes. Returns an unsubscribe that also releases the
// shared connection when the last subscriber leaves.
export const subscribeProject = (
  projectId: number,
  resource: Resource,
  onBump: () => void,
): (() => void) => {
  // No EventSource (jsdom tests / SSR): skip the stream — the poll backstop in
  // the consuming hooks keeps data fresh.
  if (typeof EventSource === 'undefined') return () => {}
  const ch = acquire(projectId)
  const listener: Listener = r => {
    if (r === resource) onBump()
  }
  ch.listeners.add(listener)
  return () => {
    ch.listeners.delete(listener)
    release(projectId)
  }
}
