import type { Id } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../app/api-context'
import { sessionPath } from '../../app/route'
import { SearchIcon } from '../../components/icons'
import { useWorkers } from '../workers/use-workers'
import { buildSessionGroups } from './session-list'
import { SessionRow } from './session-row'
import { useSessions } from './use-sessions'

type SessionsPanelProps = {
  projectId: Id
  activeId: string
  open(path: string, title: string): void
  close(path: string): void
}

export const SessionsPanel = ({ projectId, activeId, open, close }: SessionsPanelProps) => {
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
    <section aria-label="Conversations" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1 px-1">
        <label className="flex min-w-44 flex-1 items-center gap-1.5 rounded px-1 text-ui-muted focus-within:outline focus-within:outline-ui-accent">
          <SearchIcon />
          <input
            aria-label="Search conversations"
            placeholder="Search conversations…"
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="ui-context-select w-full px-0 placeholder:text-ui-muted focus-visible:outline-none"
          />
        </label>
        <select
          aria-label="Filter by worker"
          value={selectedWorker ?? ''}
          onChange={event => setWorkerId(event.target.value ? Number(event.target.value) : null)}
          className="ui-context-select max-w-32"
        >
          <option value="">All workers</option>
          {workers.data?.map(worker => (
            <option key={worker.id} value={worker.id}>
              {worker.name}
            </option>
          ))}
        </select>
        {workers.error && (
          <p role="status" className="w-full text-xs text-ui-muted">
            Worker filters could not be refreshed.{' '}
            <button type="button" onClick={workers.refresh} className="underline">
              Retry
            </button>
          </p>
        )}
      </div>
      {sessions.loading && sessions.data === null && (
        <div role="status" className="space-y-2 px-2">
          <span className="sr-only">Loading conversations…</span>
          {[1, 2, 3].map(id => (
            <div key={id} className="h-12 rounded-md bg-ui-hover" />
          ))}
        </div>
      )}
      {sessions.error && (
        <p role="alert" className="px-2 text-xs text-ui-danger">
          {sessions.data ? 'Conversations may be out of date.' : 'Unable to load conversations.'}{' '}
          <button type="button" className="underline" onClick={sessions.refresh}>
            Retry
          </button>
        </p>
      )}
      {!sessions.loading && !sessions.error && groups.length === 0 && (
        <p className="px-2 text-sm text-ui-muted">
          {query || selectedWorker !== null
            ? 'No matching conversations. Try a different search or worker.'
            : 'No conversations yet. Start one with New conversation.'}
        </p>
      )}
      {groups.map(group => (
        <div key={group.label}>
          <h2 className="mb-1 px-2 text-xs font-medium text-ui-muted">{group.label}</h2>
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
    </section>
  )
}
