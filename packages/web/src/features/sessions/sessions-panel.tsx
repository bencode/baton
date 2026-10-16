import type { Id } from '@baton/shared'
import { type ReactNode, useState } from 'react'
import { useApi } from '../../app/api-context'
import { sessionPath } from '../../app/route'
import { useWorkers } from '../workers/use-workers'
import { SessionFilters } from './session-filters'
import { buildSessionGroups } from './session-list'
import { SessionRow } from './session-row'
import { useSessions } from './use-sessions'

type SessionsPanelProps = {
  projectId: Id
  activeId: string
  open(path: string, title: string): void
  close(path: string): void
  onNewSession(): void
  renderToolbar(actions: ReactNode): ReactNode
}
const groupLabels: Record<string, string> = {
  Today: '今天',
  Yesterday: '昨天',
  'Previous 7 days': '过去 7 天',
  Earlier: '更早',
}

export const SessionsPanel = ({
  projectId,
  activeId,
  open,
  close,
  onNewSession,
  renderToolbar,
}: SessionsPanelProps) => {
  const api = useApi()
  const sessions = useSessions(projectId)
  const workers = useWorkers(projectId)
  const [query, setQuery] = useState('')
  const [workerId, setWorkerId] = useState<Id | null>(null)
  const [deleted, setDeleted] = useState<Id[]>([])
  const selectedWorker = workers.data?.some(worker => worker.id === workerId) ? workerId : null
  const groups = buildSessionGroups(
    (sessions.data ?? []).filter(session => !deleted.includes(session.id)),
    { query, workerId: selectedWorker },
    Date.now(),
  )
  return (
    <section aria-label="会话" className="wb-category-panel">
      <SessionFilters
        query={query}
        workerId={selectedWorker}
        workers={workers.data}
        loading={workers.loading}
        error={workers.error}
        onRefresh={workers.refresh}
        onQueryChange={setQuery}
        onWorkerChange={setWorkerId}
        onNewSession={onNewSession}
        renderToolbar={renderToolbar}
      />
      <div className="wb-session-list">
        {sessions.loading && sessions.data === null && (
          <div role="status" className="space-y-2 px-3 py-4">
            <span className="sr-only">加载会话…</span>
            {[1, 2, 3].map(id => (
              <div key={id} className="h-12 rounded-lg bg-ui-hover" />
            ))}
          </div>
        )}
        {sessions.error && (
          <p role="alert" className="px-3 py-4 text-xs text-ui-danger">
            {sessions.data ? '会话列表可能不是最新状态。' : '无法加载会话。'}{' '}
            <button type="button" className="underline" onClick={sessions.refresh}>
              重试
            </button>
          </p>
        )}
        {!sessions.loading && !sessions.error && groups.length === 0 && (
          <p className="px-3 py-6 text-xs text-ui-muted">
            {query || selectedWorker !== null
              ? '没有匹配的会话，请调整搜索或筛选。'
              : '暂无会话，点击“新会话”开始。'}
          </p>
        )}
        {groups.map(group => (
          <div key={group.label} className="wb-session-group">
            <h2 className="wb-list-label">
              <span>{groupLabels[group.label] ?? group.label}</span>
              <span>{group.sessions.length}</span>
            </h2>
            {group.sessions.map(session => {
              const path = sessionPath(projectId, session.id)
              return (
                <SessionRow
                  key={session.id}
                  session={session}
                  active={activeId === path}
                  onOpen={() => open(path, session.name)}
                  onDelete={async () => {
                    await api.sessions.remove(session.id)
                    setDeleted(previous => [...previous, session.id])
                    close(path)
                    sessions.refresh()
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
    </section>
  )
}
