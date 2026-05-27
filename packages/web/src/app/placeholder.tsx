import { useState } from 'react'

// Plan 2 replaces this with the `project ▾` selector + Requirements/Workers tree.
// For now it offers demo entries (more than MAX_TABS) so the shell — split drag,
// tab open/close/switch, Activity keep-alive, LRU eviction — is verifiable end to end.
const DEMO_ITEMS = ['login', 'design', 'impl', 'test', 'deploy', 'docs', 'audit']

type LeftPlaceholderProps = { onOpen: (path: string) => void }

export const LeftPlaceholder = ({ onOpen }: LeftPlaceholderProps) => (
  <div className="flex h-full flex-col gap-1 overflow-auto bg-gray-50 p-3">
    <div className="px-1 pb-2 text-xs font-semibold tracking-wide text-gray-400 uppercase">
      resources · Plan 2
    </div>
    {DEMO_ITEMS.map(id => (
      <button
        key={id}
        type="button"
        onClick={() => onOpen(`/t/${id}`)}
        className="rounded px-2 py-1 text-left text-sm text-gray-700 hover:bg-gray-200"
      >
        {id}
      </button>
    ))}
  </div>
)

type DemoTabProps = { title: string }

// Placeholder detail body. The local counter proves <Activity> keep-alive:
// switch away and back and the count survives because the tab stays mounted.
export const DemoTab = ({ title }: DemoTabProps) => {
  const [count, setCount] = useState(0)
  return (
    <div className="flex flex-col items-start gap-3 p-6">
      <h2 className="font-mono text-lg font-semibold text-gray-900">{title}</h2>
      <p className="text-sm text-gray-500">Detail panel — wired in a later plan.</p>
      <button
        type="button"
        onClick={() => setCount(c => c + 1)}
        className="rounded border border-gray-300 px-3 py-1 text-sm hover:bg-gray-50"
      >
        keep-alive count: {count}
      </button>
    </div>
  )
}

export const EmptyMain = () => (
  <div className="flex h-full items-center justify-center text-sm text-gray-400">
    Select a resource to open a tab.
  </div>
)
