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
    health === 'ok' ? 'bg-ui-success' : health === 'unreachable' ? 'bg-ui-danger' : 'bg-gray-400'
  return (
    <span className="wb-health inline-flex items-center gap-2 text-[11px] text-ui-muted">
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      服务连接：{{ checking: '检查中', ok: '正常', unreachable: '无法连接' }[health]}
    </span>
  )
}
