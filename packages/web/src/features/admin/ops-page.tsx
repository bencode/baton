import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { OpsBoard } from './ops-page/ops-board'
import { computeStats, toSections } from './ops-page/sections'
import { useOverview, usePreviews } from './ops-page/use-overview'

export const OpsPage = () => {
  const { data, error, updatedAt } = useOverview()
  const previews = usePreviews(data?.sessions)
  const sections = useMemo(() => (data ? toSections(data) : []), [data])
  const workerName = useMemo(() => new Map((data?.workers ?? []).map(w => [w.id, w.name])), [data])
  const forbidden = error?.includes('403') ?? false
  const { busy, idle, offline } = computeStats(data)

  return (
    <div className="min-h-screen bg-black px-6 py-5 font-mono text-gray-300">
      <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="text-base font-bold tracking-wide text-white">⬢ BATON MISSION CONTROL</h1>
        {data && (
          <span className="text-sm text-gray-500">
            <span className="text-violet-400">● {busy} working</span> · {idle} idle ·{' '}
            {offline > 0 ? (
              <span className="text-red-400/80">{offline} worker offline</span>
            ) : (
              'all workers alive'
            )}
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-gray-600">
          {updatedAt && <span>{new Date(updatedAt).toLocaleTimeString('zh-CN')} ↻</span>}
          <Link to="/" className="text-gray-600 underline-offset-2 hover:text-gray-300">
            返回
          </Link>
        </span>
      </div>

      {forbidden ? (
        <div className="grid h-[60vh] place-items-center text-gray-600">需要管理员权限</div>
      ) : (
        <>
          {error && !forbidden && (
            <div className="mb-3 text-xs text-red-400/80">
              refresh failed (showing last snapshot): {error}
            </div>
          )}
          <OpsBoard sections={sections} workerName={workerName} previews={previews} />
        </>
      )}
    </div>
  )
}
