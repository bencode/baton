import type { Id, WorkerView } from '@baton/shared'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { CheckIcon, CloseIcon, FilterIcon, PlusIcon, SearchIcon } from '../../components/icons'
import { Popover } from '../../components/popover'

type SessionFiltersProps = {
  query: string
  workerId: Id | null
  workers: readonly WorkerView[] | null
  loading: boolean
  error: Error | null
  onRefresh(): void
  onQueryChange(query: string): void
  onWorkerChange(id: Id | null): void
  onNewSession(): void
  renderToolbar(actions: ReactNode): ReactNode
}
export const SessionFilters = ({
  query,
  workerId,
  workers,
  loading,
  error,
  onRefresh,
  onQueryChange,
  onWorkerChange,
  onNewSession,
  renderToolbar,
}: SessionFiltersProps) => {
  const [searchOpen, setSearchOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const searchTrigger = useRef<HTMLButtonElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const filterTrigger = useRef<HTMLButtonElement>(null)
  const selected = workers?.find(worker => worker.id === workerId)
  useEffect(() => {
    if (searchOpen) input.current?.focus()
  }, [searchOpen])
  const closeSearch = () => {
    onQueryChange('')
    setSearchOpen(false)
    searchTrigger.current?.focus()
  }
  return (
    <>
      {renderToolbar(
        <div className="wb-list-actions">
          <button
            ref={searchTrigger}
            type="button"
            className="ui-icon-button"
            aria-label="搜索会话"
            title="搜索会话"
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen) closeSearch()
              else {
                setSearchOpen(true)
                setAnchor(null)
              }
            }}
          >
            <SearchIcon />
          </button>
          <button
            ref={filterTrigger}
            type="button"
            className="ui-icon-button"
            aria-label="按执行环境筛选"
            title="按执行环境筛选"
            aria-haspopup="menu"
            aria-expanded={anchor !== null}
            data-filtered={workerId !== null}
            onClick={event => setAnchor(anchor ? null : event.currentTarget)}
          >
            <FilterIcon />
          </button>
          <button
            type="button"
            className="ui-icon-button"
            aria-label="新会话"
            title="新会话"
            onClick={onNewSession}
          >
            <PlusIcon />
          </button>
        </div>,
      )}
      {searchOpen && (
        <div className="wb-search-panel">
          <label className="ui-search wb-search">
            <SearchIcon />
            <input
              ref={input}
              type="search"
              aria-label="搜索当前项目的会话"
              placeholder="搜索当前项目的会话…"
              value={query}
              onChange={event => onQueryChange(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Escape') {
                  event.preventDefault()
                  event.stopPropagation()
                  closeSearch()
                }
              }}
            />
            <button
              type="button"
              className="ui-icon-button"
              aria-label="关闭搜索并清空"
              title="关闭搜索并清空"
              onClick={closeSearch}
            >
              <CloseIcon />
            </button>
          </label>
        </div>
      )}
      {selected && (
        <div className="wb-filter-chip">
          <span className="truncate">
            执行环境：<strong>{selected.name}</strong>
          </span>
          <button
            type="button"
            className="ui-icon-button"
            aria-label="清除执行环境筛选"
            onClick={() => {
              onWorkerChange(null)
              filterTrigger.current?.focus()
            }}
          >
            <CloseIcon />
          </button>
        </div>
      )}
      <Popover
        anchor={anchor}
        role="menu"
        label="按执行环境筛选"
        placement="bottom-end"
        onClose={() => setAnchor(null)}
      >
        <div className="ui-menu-caption">按执行环境筛选</div>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={workerId === null}
          className="ui-menu-item"
          onClick={() => {
            onWorkerChange(null)
            setAnchor(null)
            filterTrigger.current?.focus()
          }}
        >
          全部执行环境{workerId === null && <CheckIcon />}
        </button>
        {workers?.map(worker => (
          <button
            key={worker.id}
            type="button"
            role="menuitemradio"
            aria-checked={workerId === worker.id}
            className="ui-menu-item"
            onClick={() => {
              onWorkerChange(worker.id)
              setAnchor(null)
              filterTrigger.current?.focus()
            }}
          >
            <span className="min-w-0 flex-1 truncate" title={worker.name}>
              {worker.name}
            </span>
            {workerId === worker.id && <CheckIcon />}
          </button>
        ))}
        {loading && workers === null && (
          <p role="status" className="px-3 py-2 text-xs text-ui-muted">
            加载执行环境…
          </p>
        )}
        {!loading && workers?.length === 0 && (
          <p className="px-3 py-2 text-xs text-ui-muted">暂无执行环境</p>
        )}
      </Popover>
      {error && (
        <p role="status" className="px-3 pt-3 text-xs text-ui-muted">
          无法刷新执行环境筛选。
          <button type="button" className="underline" onClick={onRefresh}>
            重试
          </button>
        </p>
      )}
    </>
  )
}
