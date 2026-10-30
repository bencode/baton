import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { emptyTabsPath, isItemRoute, parseRoute } from '../route'
import { closeToRight, openTab, type Tab } from './tabs-model'

const storageKey = (cacheScope: string): string => `baton.tabs.${cacheScope}`

const isTab = (value: unknown): value is Tab =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  typeof value.id === 'string' &&
  isItemRoute(value.id) &&
  'title' in value &&
  typeof value.title === 'string' &&
  'lastActiveAt' in value &&
  typeof value.lastActiveAt === 'number'

const loadTabs = (cacheScope: string): Tab[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(cacheScope)) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isTab) : []
  } catch (error) {
    console.warn('[tabs] could not restore tabs', error)
    return []
  }
}

const fallbackTitle = (id: string): string => {
  const route = parseRoute(id)
  if (route.kind === 'project-view')
    return { workers: 'Workers', services: 'Services', settings: 'Project settings' }[route.view]
  if (route.kind === 'file') return route.path.split('/').at(-1) ?? route.path
  return (id.split('/').pop() ?? id).slice(0, 8)
}

export type TabsController = {
  tabs: Tab[]
  activeId: string
  open(id: string, title: string): void
  close(id: string): void
  closeMatching(match: (tab: Tab) => boolean, fallbackPath?: string): void
  closeOthers(id: string): void
  closeRight(id: string): void
  closeAll(): void
  retitle(id: string, title: string): void
}

export const useTabs = (cacheScope: string): TabsController => {
  const { pathname: activeId } = useLocation()
  const navigate = useNavigate()
  const [tabs, setTabs] = useState<Tab[]>(() => loadTabs(cacheScope))
  const pendingTitle = useRef<Record<string, string>>({})
  // Async resource deletion can complete after the user opens or switches tabs.
  const latest = useRef({ tabs, activeId })
  latest.current = { tabs, activeId }

  useEffect(() => {
    try {
      localStorage.setItem(storageKey(cacheScope), JSON.stringify(tabs))
    } catch (error) {
      console.warn('[tabs] could not persist tabs', error)
    }
  }, [cacheScope, tabs])

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

  const closeMatching = useCallback(
    (match: (tab: Tab) => boolean, fallbackPath?: string) => {
      const current = latest.current
      const survivors = current.tabs.filter(tab => !match(tab))
      const activeIndex = current.tabs.findIndex(tab => tab.id === current.activeId)
      const removedActive = current.tabs.some(tab => tab.id === current.activeId && match(tab))
      latest.current = { ...current, tabs: survivors }
      setTabs(survivors)
      if (!removedActive) return
      const right = current.tabs.slice(activeIndex + 1).find(tab => !match(tab))
      const left = current.tabs
        .slice(0, activeIndex)
        .reverse()
        .find(tab => !match(tab))
      navigate(fallbackPath ?? right?.id ?? left?.id ?? emptyTabsPath(current.activeId))
    },
    [navigate],
  )

  const close = useCallback(
    (id: string) => {
      closeMatching(tab => tab.id === id)
    },
    [closeMatching],
  )

  const closeOthers = useCallback(
    (id: string) => {
      const activeWasOpen = latest.current.tabs.some(tab => tab.id === latest.current.activeId)
      closeMatching(tab => tab.id !== id, id)
      if (!activeWasOpen) navigate(id)
    },
    [closeMatching, navigate],
  )

  const closeRight = useCallback(
    (id: string) => {
      const survivors = closeToRight(latest.current.tabs, id)
      closeMatching(tab => !survivors.some(survivor => survivor.id === tab.id), id)
    },
    [closeMatching],
  )

  const closeAll = useCallback(() => {
    closeMatching(() => true, emptyTabsPath(latest.current.activeId))
  }, [closeMatching])

  const retitle = useCallback((id: string, title: string) => {
    setTabs(prev => {
      const tab = prev.find(entry => entry.id === id)
      return !tab || tab.title === title
        ? prev
        : prev.map(entry => (entry.id === id ? { ...entry, title } : entry))
    })
  }, [])

  return { tabs, activeId, open, close, closeMatching, closeOthers, closeRight, closeAll, retitle }
}
