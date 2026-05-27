import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { closeTab, neighborTab, openTab, type Tab } from './tabs-model.ts'

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

export type TabsController = {
  tabs: Tab[]
  activeId: string
  open: (id: string) => void
  close: (id: string) => void
}

// Open tabs live in App-shell state (persisted to localStorage); the active tab
// is the URL. `titleFor` maps a path to a tab title, or null for non-tab routes.
export const useTabs = (titleFor: (path: string) => string | null): TabsController => {
  const location = useLocation()
  const navigate = useNavigate()
  const [tabs, setTabs] = useState<Tab[]>(loadTabs)
  const activeId = location.pathname

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs))
  }, [tabs])

  // The URL is the source of truth for the active tab; mirror it into the list.
  useEffect(() => {
    const title = titleFor(activeId)
    if (title === null) return
    setTabs(prev => openTab(prev, { id: activeId, title }, Date.now()))
  }, [activeId, titleFor])

  const open = useCallback((id: string) => navigate(id), [navigate])

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
