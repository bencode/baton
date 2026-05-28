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
    <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-gray-200 bg-gray-50">
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
              title={tab.title}
              className={`max-w-[220px] truncate py-1 pl-3 text-sm ${
                isActive ? 'text-gray-900' : 'text-gray-600'
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
