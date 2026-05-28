import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { isItemRoute } from '../route'
import { closeTab, neighborTab, openTab, type Tab } from './tabs-model'

const STORAGE_KEY = 'baton.tabs'

const loadTabs = (): Tab[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Fallback title when an item route is reached without going through `open`
// (e.g. a pasted URL): a short slice of the id segment until detail data loads.
const fallbackTitle = (id: string): string => (id.split('/').pop() ?? id).slice(0, 8)

export type TabsController = {
  tabs: Tab[]
  activeId: string
  open: (id: string, title: string) => void
  close: (id: string) => void
}

// Open tabs live in App-shell state (persisted to localStorage); the active tab
// is the URL. Tree clicks call open(itemPath, title); switching workspace/project
// navigates directly (those paths aren't item routes, so no tab is opened).
export const useTabs = (): TabsController => {
  const location = useLocation()
  const navigate = useNavigate()
  const [tabs, setTabs] = useState<Tab[]>(loadTabs)
  const pendingTitle = useRef<Record<string, string>>({})
  const activeId = location.pathname

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  }, [tabs])

  // The URL is the source of truth: when it points at an item route, ensure a
  // tab exists. openTab keeps an existing tab's title, so this also handles
  // touch-on-revisit; the title is only used when adding a new tab.
  useEffect(() => {
    if (!isItemRoute(activeId)) return
    const title = pendingTitle.current[activeId] ?? fallbackTitle(activeId)
    setTabs(prev => openTab(prev, { id: activeId, title }, Date.now()))
  }, [activeId])

  const open = useCallback(
    (id: string, title: string) => {
      pendingTitle.current[id] = title
      navigate(id)
    },
    [navigate],
  )

  const close = useCallback(
    (id: string) => {
      setTabs(prev => closeTab(prev, id))
      if (id !== activeId) return
      const fallback = neighborTab(tabs, id)
      navigate(fallback ? fallback.id : '/')
    },
    [tabs, activeId, navigate],
  )

  return { tabs, activeId, open, close }
}
