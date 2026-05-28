import type { Tab } from './tabs-model'

type TabBarProps = {
  tabs: Tab[]
  activeId: string
  onSelect: (id: string) => void
  onClose: (id: string) => void
}

export const TabBar = ({ tabs, activeId, onSelect, onClose }: TabBarProps) => {
  if (tabs.length === 0) return null
  return (
    <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-gray-200 bg-gray-100">
      {tabs.map(tab => {
        const isActive = tab.id === activeId
        return (
          <div
            key={tab.id}
            className={`group flex h-full items-center border-r border-gray-200 ${
              isActive ? 'bg-white' : 'hover:bg-gray-50'
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(tab.id)}
              title={tab.id}
              className={`max-w-[160px] truncate py-1 pl-3 text-sm ${
                isActive ? 'text-gray-900' : 'text-gray-500'
              }`}
            >
              {tab.title}
            </button>
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={() => onClose(tab.id)}
              className={`mr-1 ml-1 rounded px-1 text-gray-400 hover:bg-gray-200 hover:text-gray-700 ${
                isActive ? 'opacity-70' : 'opacity-0 group-hover:opacity-70'
              }`}
            >
              ×
            </button>
          </div>
        )
      })}
    </div>
  )
}
