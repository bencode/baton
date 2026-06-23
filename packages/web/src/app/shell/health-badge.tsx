import { useEffect, useState } from 'react'
import { useApi } from '../api-context'

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
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {`server: ${health}`}
    </span>
  )
}
