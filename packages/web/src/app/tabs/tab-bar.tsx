import { useEffect, useState } from 'react'
import type { Tab } from './tabs-model'

type TabBarProps = {
  tabs: Tab[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseRight: (id: string) => void
  onCloseAll: () => void
}

type Menu = { tabId: string; x: number; y: number }

// Edge-style right-click menu on a tab. Anchored at the cursor; dismissed by an
// outside click or Escape. Items are disabled when they'd be no-ops (one tab,
// or the rightmost tab for "close to the right").
const TabContextMenu = ({
  menu,
  tabs,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  dismiss,
}: {
  menu: Menu
  tabs: Tab[]
  onClose: (id: string) => void
  onCloseOthers: (id: string) => void
  onCloseRight: (id: string) => void
  onCloseAll: () => void
  dismiss: () => void
}) => {
  const idx = tabs.findIndex(t => t.id === menu.tabId)
  const isLast = idx === tabs.length - 1
  const alone = tabs.length <= 1
  const run = (fn: () => void) => () => {
    fn()
    dismiss()
  }
  const item = (label: string, onClick: () => void, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={run(onClick)}
      className="flex w-full items-center px-3 py-1.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-default disabled:text-gray-300 disabled:hover:bg-transparent"
    >
      {label}
    </button>
  )
  return (
    <div
      role="menu"
      style={{ left: menu.x, top: menu.y }}
      // The dismiss listener fires on document `mousedown`; stop menu-internal
      // mousedowns here so it doesn't unmount the menu before an item's onClick.
      onMouseDown={e => e.stopPropagation()}
      className="fixed z-30 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg shadow-gray-900/10"
    >
      {item('Close', () => onClose(menu.tabId))}
      {item('Close others', () => onCloseOthers(menu.tabId), alone)}
      {item('Close to the right', () => onCloseRight(menu.tabId), isLast)}
      {item('Close all', onCloseAll)}
    </div>
  )
}

export const TabBar = ({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
}: TabBarProps) => {
  const [menu, setMenu] = useState<Menu | null>(null)

  // Dismiss the context menu on any outside click or Escape (mirrors UserMenu).
  useEffect(() => {
    if (!menu) return
    const onDown = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menu])

  if (tabs.length === 0) return null
  return (
    <div className="flex h-8 shrink-0 items-center overflow-x-auto border-b border-gray-200 bg-gray-50">
      {tabs.map(tab => {
        const isActive = tab.id === activeId
        return (
          <div
            key={tab.id}
            className={`group relative flex h-full items-center border-r border-gray-200 transition-colors duration-150 ${
              isActive ? 'bg-white' : 'hover:bg-white/70'
            }`}
          >
            {isActive && (
              <span className="absolute inset-x-0 top-0 h-[2px] bg-blue-500" aria-hidden />
            )}
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              // Right-click anywhere on the tab label opens the batch-close menu.
              onContextMenu={e => {
                e.preventDefault()
                setMenu({ tabId: tab.id, x: e.clientX, y: e.clientY })
              }}
              title={tab.title}
              className={`max-w-[140px] truncate pl-3.5 text-sm sm:max-w-[220px] ${
                isActive ? 'text-gray-900' : 'text-gray-600'
              }`}
            >
              {tab.title}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={() => onClose(tab.id)}
              className={`mr-2 ml-2 rounded px-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 ${
                isActive ? 'opacity-70' : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-70'
              }`}
            >
              ×
            </button>
          </div>
        )
      })}
      {menu && (
        <TabContextMenu
          menu={menu}
          tabs={tabs}
          onClose={onClose}
          onCloseOthers={onCloseOthers}
          onCloseRight={onCloseRight}
          onCloseAll={onCloseAll}
          dismiss={() => setMenu(null)}
        />
      )}
    </div>
  )
}
