import { useEffect, useRef, useState } from 'react'
import {
  ChatIcon,
  CloseIcon,
  FileIcon,
  MoreIcon,
  ServiceIcon,
  SettingsIcon,
  WorkerIcon,
} from '../../components/icons'
import { Popover } from '../../components/popover'
import { activeProjectId, parseRoute } from '../route'
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
type Menu = { tabId: string; anchor: HTMLElement; point?: { x: number; y: number } }
const tabIcon = (path: string) => {
  const route = parseRoute(path)
  if (route.kind === 'project-view') {
    if (route.view === 'workers') return <WorkerIcon />
    if (route.view === 'services') return <ServiceIcon />
    return <SettingsIcon />
  }
  if (route.kind === 'service') return <ServiceIcon />
  if (route.kind === 'file') return <FileIcon />
  return <ChatIcon />
}
const tabLabel = (tab: Tab) => {
  const route = parseRoute(tab.id)
  return route.kind === 'project-view'
    ? { workers: '执行环境', services: '服务', settings: '项目设置' }[route.view]
    : tab.title
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
  const activeButton = useRef<HTMLButtonElement>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!tabs.length) return
    const showActive = () => {
      if (activeButton.current?.dataset.tabId === activeId)
        activeButton.current.parentElement?.scrollIntoView?.({
          block: 'nearest',
          inline: 'nearest',
        })
    }
    showActive()
    const observer = new ResizeObserver(showActive)
    if (scrollArea.current) {
      observer.observe(scrollArea.current)
      Array.from(scrollArea.current.children).forEach(element => {
        observer.observe(element)
      })
    }
    return () => observer.disconnect()
  }, [activeId, tabs.length])
  const dismiss = () => {
    setMenu(null)
    const trigger = menu?.anchor
    requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus()
      else activeButton.current?.focus()
    })
  }
  const act = (run: () => void) => {
    run()
    dismiss()
  }
  const targetIndex = tabs.findIndex(tab => tab.id === menu?.tabId)
  if (!tabs.length) return null
  return (
    <nav className="wb-tab-strip" aria-label="已打开的页面">
      <div ref={scrollArea} className="wb-open-tabs">
        {tabs.map(tab => {
          const active = tab.id === activeId
          const title = tabLabel(tab)
          return (
            <div key={tab.id} className="wb-page-tab group" data-active={active}>
              <button
                ref={active ? activeButton : undefined}
                data-tab-id={tab.id}
                type="button"
                className="wb-tab-label"
                aria-current={active ? 'page' : undefined}
                title={title}
                onClick={() => onSelect(tab.id)}
                onContextMenu={event => {
                  event.preventDefault()
                  setMenu({
                    tabId: tab.id,
                    anchor: event.currentTarget,
                    point: { x: event.clientX, y: event.clientY },
                  })
                }}
              >
                {tabIcon(tab.id)}
                <span className="min-w-0 truncate">
                  <ProjectTabLabel
                    tab={{ ...tab, title }}
                    activeProjectId={activeProjectId(activeId)}
                  />
                </span>
              </button>
              <button
                type="button"
                className="ui-icon-button wb-tab-close"
                aria-label={`关闭 ${title}`}
                title={`关闭 ${title}`}
                onClick={() => onClose(tab.id)}
              >
                <CloseIcon />
              </button>
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="ui-icon-button wb-tab-actions"
        aria-label="页签操作"
        title="页签操作"
        aria-haspopup="menu"
        aria-expanded={menu !== null}
        disabled={!tabs.some(tab => tab.id === activeId)}
        onClick={event => setMenu(menu ? null : { tabId: activeId, anchor: event.currentTarget })}
      >
        <MoreIcon />
      </button>
      <Popover
        anchor={menu?.anchor ?? null}
        point={menu?.point}
        label="页签操作"
        role="menu"
        placement="bottom-end"
        onClose={() => setMenu(null)}
      >
        <div className="ui-menu-caption truncate">
          {tabs.filter(tab => tab.id === menu?.tabId).map(tab => tabLabel(tab))}
        </div>
        <button
          type="button"
          role="menuitem"
          className="ui-menu-item"
          onClick={() =>
            act(() => {
              if (menu) onClose(menu.tabId)
            })
          }
        >
          关闭当前页签
        </button>
        <button
          type="button"
          role="menuitem"
          className="ui-menu-item"
          disabled={tabs.length < 2}
          onClick={() =>
            act(() => {
              if (menu) onCloseOthers(menu.tabId)
            })
          }
        >
          关闭其他页签
        </button>
        <button
          type="button"
          role="menuitem"
          className="ui-menu-item"
          disabled={targetIndex < 0 || targetIndex === tabs.length - 1}
          onClick={() =>
            act(() => {
              if (menu) onCloseRight(menu.tabId)
            })
          }
        >
          关闭右侧页签
        </button>
        <div className="ui-menu-rule" />
        <button
          type="button"
          role="menuitem"
          className="ui-menu-item"
          onClick={() => act(onCloseAll)}
        >
          关闭全部页签
        </button>
      </Popover>
    </nav>
  )
}
