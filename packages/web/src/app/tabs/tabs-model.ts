// Pure tab-list model for the App shell. The active tab is tracked by the URL
// (react-router); this module only owns the open list and its LRU recency.

export const MAX_TABS = 6

export type Tab = {
  id: string
  title: string
  lastActiveAt: number
}

// Add a new tab, or refresh an existing one's recency, evicting the
// least-recently-active tab when the count would exceed MAX_TABS.
export const openTab = (tabs: Tab[], entry: { id: string; title: string }, now: number): Tab[] => {
  const exists = tabs.some(t => t.id === entry.id)
  const next = exists
    ? tabs.map(t => (t.id === entry.id ? { ...t, lastActiveAt: now } : t))
    : [...tabs, { id: entry.id, title: entry.title, lastActiveAt: now }]
  return next.length > MAX_TABS ? evictLru(next, entry.id) : next
}

// Drop the least-recently-active tab, never the one identified by keepId
// (which is the tab just opened, so it must survive eviction).
const evictLru = (tabs: Tab[], keepId: string): Tab[] => {
  const victim = tabs
    .filter(t => t.id !== keepId)
    .reduce<Tab | null>((lru, t) => (lru && lru.lastActiveAt <= t.lastActiveAt ? lru : t), null)
  return victim ? tabs.filter(t => t.id !== victim.id) : tabs
}

export const closeTab = (tabs: Tab[], id: string): Tab[] => tabs.filter(t => t.id !== id)

// Batch closes (Edge-style tab context menu). All pure list filters; the
// controller handles re-navigation when the active tab is among those removed.
export const closeOthers = (tabs: Tab[], keepId: string): Tab[] => tabs.filter(t => t.id === keepId)

// Keep tabs up to and including `id`; drop everything to its right. Unknown id
// leaves the list untouched.
export const closeToRight = (tabs: Tab[], id: string): Tab[] => {
  const idx = tabs.findIndex(t => t.id === id)
  return idx === -1 ? tabs : tabs.slice(0, idx + 1)
}

// The tab to activate after closing `id`: its positional neighbor (next, else previous).
export const neighborTab = (tabs: Tab[], id: string): Tab | null => {
  const idx = tabs.findIndex(t => t.id === id)
  if (idx === -1) return null
  return tabs[idx + 1] ?? tabs[idx - 1] ?? null
}
