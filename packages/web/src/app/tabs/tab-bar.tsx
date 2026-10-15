import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CloseIcon, MoreIcon } from '../../components/icons'
import { activeProjectId } from '../route'
import { ProjectTabLabel } from './project-tab-label'
import type { Tab } from './tabs-model'

type TabBarProps = {
  tabs: Tab[]
  activeId: string
  onSelect(id: string): void
  onClose(id: string): void
  onCloseOthers(id: string): void
  onCloseRight(id: string): void
  onCloseAll(): void
}

type Menu = { tabId: string; x: number; y: number }

const TabContextMenu = ({
  menu,
  tabs,
  onClose,
  onCloseOthers,
  onCloseRight,
  onCloseAll,
  dismiss,
}: Omit<TabBarProps, 'activeId' | 'onSelect'> & { menu: Menu; dismiss(): void }) => {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])
  const item = (label: string, run: () => void, disabled = false) => (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        run()
        dismiss()
      }}
      className="ui-focus flex min-h-11 w-full items-center px-3 py-2 text-left text-xs text-ui-text hover:bg-ui-hover disabled:text-ui-muted md:min-h-8"
    >
      {label}
    </button>
  )
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Tab actions"
      style={{
        left: Math.max(8, Math.min(menu.x, window.innerWidth - 200)),
        top: Math.max(8, Math.min(menu.y, window.innerHeight - 180)),
      }}
      onMouseDown={event => event.stopPropagation()}
      onKeyDown={event => {
        const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End']
        if (!keys.includes(event.key)) return
        event.preventDefault()
        const items = Array.from(
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
        )
        const index =
          document.activeElement instanceof HTMLButtonElement
            ? items.indexOf(document.activeElement)
            : -1
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[next]?.focus()
      }}
      className="fixed z-50 w-48 rounded-md border border-ui-border bg-ui-surface py-1"
    >
      {item('Close', () => onClose(menu.tabId))}
      {item('Close others', () => onCloseOthers(menu.tabId), tabs.length < 2)}
      {item('Close to the right', () => onCloseRight(menu.tabId), tabs.at(-1)?.id === menu.tabId)}
      {item('Close all', onCloseAll)}
    </div>,
    document.body,
  )
}

export const TabBar = (props: TabBarProps) => {
  const { tabs, activeId, onSelect, onClose } = props
  const [menu, setMenu] = useState<Menu | null>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const activeButton = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    if (activeButton.current?.dataset.tabId === activeId)
      activeButton.current.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [activeId])
  useEffect(() => {
    if (!menu) return
    const onDown = () => setMenu(null)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenu(null)
      trigger.current?.focus()
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
    <nav
      aria-label="Open pages"
      className="flex h-11 shrink-0 items-stretch overflow-x-auto border-b border-ui-border bg-ui-info-surface md:h-[38px] [@media(pointer:coarse)]:h-11"
    >
      {tabs.map(tab => {
        const active = tab.id === activeId
        return (
          <div
            key={tab.id}
            data-active={active}
            className={`group relative flex w-max min-w-40 max-w-60 shrink-0 items-center border-r border-ui-border/70 ${active ? 'bg-ui-surface after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-ui-accent' : 'hover:bg-ui-hover'}`}
          >
            <button
              ref={active ? activeButton : undefined}
              data-tab-id={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={active ? 'page' : undefined}
              title={tab.title}
              onContextMenu={event => {
                event.preventDefault()
                trigger.current = event.currentTarget
                setMenu({ tabId: tab.id, x: event.clientX, y: event.clientY })
              }}
              className={`ui-focus h-full min-w-0 flex-1 truncate px-3 text-left text-xs ${active ? 'font-medium text-ui-selected-text' : 'text-ui-muted'}`}
            >
              <ProjectTabLabel tab={tab} activeProjectId={activeProjectId(activeId)} />
            </button>
            <button
              type="button"
              aria-label={`Actions for ${tab.title}`}
              aria-haspopup="menu"
              aria-expanded={menu?.tabId === tab.id}
              onClick={event => {
                const box = event.currentTarget.getBoundingClientRect()
                trigger.current = event.currentTarget
                setMenu({ tabId: tab.id, x: box.left, y: box.bottom })
              }}
              className="ui-icon-button [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-data-[active=true]:opacity-100"
            >
              <MoreIcon />
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={() => onClose(tab.id)}
              className="ui-icon-button mr-1 [@media(hover:hover)_and_(pointer:fine)]:opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 group-data-[active=true]:opacity-100"
            >
              <CloseIcon />
            </button>
          </div>
        )
      })}
      {menu && (
        <TabContextMenu
          {...props}
          menu={menu}
          dismiss={() => {
            setMenu(null)
            if (trigger.current?.isConnected) trigger.current.focus()
            else activeButton.current?.focus()
          }}
        />
      )}
    </nav>
  )
}
