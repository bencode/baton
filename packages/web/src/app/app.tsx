import { useEffect, useState } from 'react'
import { createApi } from '../api.ts'
import { ApiContext, useApi } from './api-context.ts'

const api = createApi()

type Health = 'checking' | 'ok' | 'unreachable'

// Probes GET /health to prove the UI → Vite proxy → server chain is wired.
export const HealthBadge = () => {
  const client = useApi()
  const [health, setHealth] = useState<Health>('checking')
  useEffect(() => {
    let alive = true
    client
      .health()
      .then(() => alive && setHealth('ok'))
      .catch(() => alive && setHealth('unreachable'))
    return () => {
      alive = false
    }
  }, [client])
  const dot =
    health === 'ok' ? 'bg-green-500' : health === 'unreachable' ? 'bg-red-500' : 'bg-gray-400'
  return (
    <span className="inline-flex items-center gap-2 text-sm text-gray-600">
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {`server: ${health}`}
    </span>
  )
}

export const App = () => (
  <ApiContext.Provider value={api}>
    <div className="min-h-full bg-gray-50 text-gray-900">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <h1 className="font-mono text-lg font-semibold">baton</h1>
        <HealthBadge />
      </header>
      <main className="p-6 text-gray-500">
        <p>UI scaffold ready — screens come next.</p>
      </main>
    </div>
  </ApiContext.Provider>
)
