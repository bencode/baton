import type { Id, SessionView, WorkerView } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../../app/api-context'
import { sessionPath } from '../../../app/route'
import { TrashIcon } from '../../../components/icons'
import { orderSessions, VISIBLE_BUDGET } from './grouping'
import { SessionRow } from './session-row'

// Display principle:
//   - A leading dot carries runtime liveness: busy (amber pulse) > active
//     (emerald) > inactive (hollow). All derived from the SessionView, never invented.
//   - Worker offline dims its whole group; a live worker gets a "+ new session".

type WorkerGroupProps = {
  worker: WorkerView
  sessions: SessionView[]
  projectId: Id
  activeId: string
  open: (id: string, title: string) => void
  close: (id: string) => void
}

export const WorkerGroup = ({
  worker,
  sessions,
  projectId,
  activeId,
  open,
  close,
}: WorkerGroupProps) => {
  const api = useApi()
  const [expanded, setExpanded] = useState(false)
  const [confirming, setConfirming] = useState(false)
  // "online" = this worker's own command stream is open (connected) — the real
  // "can take commands / run sessions" signal. A heartbeat (alive) can belong to
  // a same-machine sibling, so it isn't proof THIS worker is reachable.
  const online = worker.connected
  const dim = !online
  // Create nameless → server assigns `session-<id>`, the worker auto-titles it
  // after the first turn. Open it straight away (no prompt).
  const createSession = () => {
    void api.sessions
      .create({ projectId, workerId: worker.id })
      .then(s => open(sessionPath(projectId, s.id), s.name))
      .catch(() => {})
  }
  // Delete the worker — its sessions cascade away server-side (the project stream
  // drops them); close any of their open tabs too.
  const remove = () => {
    void api.workers
      .remove(worker.id)
      .then(() => {
        for (const s of sessions) close(sessionPath(projectId, s.id))
      })
      .catch(err => console.error('[workers] delete failed', err))
  }
  const ordered = orderSessions(sessions)
  const visible = expanded ? ordered : ordered.slice(0, VISIBLE_BUDGET)
  const hidden = ordered.length - visible.length
  return (
    <div className="flex flex-col gap-1">
      <div
        className={`group flex items-center gap-2 px-1 text-xs ${dim ? 'text-gray-400' : 'text-gray-700'}`}
      >
        <PresenceDot online={online} />
        {/* W-N: the global worker handle (same convention as R-N / T-N codes). */}
        <span className="shrink-0 font-mono text-gray-400">W-{worker.id}</span>
        <span className="min-w-0 truncate font-semibold tracking-wide">{worker.name}</span>
        {worker.hostname !== worker.name && (
          <span className="shrink-0 font-mono text-[10px] text-gray-400">{worker.hostname}</span>
        )}
        {confirming ? (
          // Deleting cascades to the worker's sessions — say how many.
          <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px]">
            <span className="text-gray-500">
              {sessions.length > 0
                ? `delete + ${sessions.length} session${sessions.length === 1 ? '' : 's'}?`
                : 'delete worker?'}
            </span>
            <button
              type="button"
              aria-label="confirm delete worker"
              title="delete worker"
              onClick={() => {
                setConfirming(false)
                remove()
              }}
              className="text-red-500 transition-colors hover:text-red-700"
            >
              ✓
            </button>
            <button
              type="button"
              aria-label="cancel delete"
              title="cancel"
              onClick={() => setConfirming(false)}
              className="text-gray-400 transition-colors hover:text-gray-700"
            >
              ✗
            </button>
          </span>
        ) : (
          <span className="ml-auto flex shrink-0 items-center gap-1">
            {online && (
              <button
                type="button"
                onClick={createSession}
                aria-label="new session"
                title="new session"
                className="px-1 text-base leading-none text-gray-400 transition-colors hover:text-blue-700"
              >
                +
              </button>
            )}
            <button
              type="button"
              aria-label="delete worker"
              title="delete worker"
              onClick={() => setConfirming(true)}
              className="px-0.5 text-gray-300 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
            >
              <TrashIcon />
            </button>
          </span>
        )}
      </div>
      {visible.map(s => {
        const path = sessionPath(projectId, s.id)
        return (
          <SessionRow
            key={s.id}
            session={s}
            path={path}
            active={activeId === path}
            dim={dim}
            open={open}
            // Delete: the project stream drops the row; also close its tab if open.
            onDelete={() => {
              void api.sessions
                .remove(s.id)
                .then(() => close(path))
                .catch(() => {})
            }}
          />
        )
      })}
      {(hidden > 0 || expanded) && ordered.length > VISIBLE_BUDGET && (
        <button
          type="button"
          onClick={() => setExpanded(e => !e)}
          className="px-4 py-0.5 text-left text-[11px] text-gray-400 transition-colors hover:text-gray-700"
        >
          {expanded ? '▾ less' : `▸ ${hidden} more`}
        </button>
      )}
    </div>
  )
}

// Worker presence dot. Solid emerald (online) vs hollow outline (offline) —
// shape difference (not just color) reads even at 8px.
const PresenceDot = ({ online }: { online: boolean }) =>
  online ? (
    <span role="img" aria-label="online" className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
  ) : (
    <span
      role="img"
      aria-label="offline"
      className="h-2 w-2 shrink-0 rounded-full border border-gray-400 bg-transparent"
    />
  )
