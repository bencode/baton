import type { Id, SessionView, WorkerView } from '@baton/shared'
import { useState } from 'react'
import { AddWorker } from './add-worker'
import { groupByWorker } from './workers-panel/grouping'
import { WorkerGroup } from './workers-panel/worker-group'

type WorkersPanelProps = {
  projectId: Id
  workers: WorkerView[] | null
  sessions: SessionView[] | null
  activeId: string
  open: (id: string, title: string) => void
  close: (id: string) => void
}

export const WorkersPanel = ({
  projectId,
  workers,
  sessions,
  activeId,
  open,
  close,
}: WorkersPanelProps) => {
  const [adding, setAdding] = useState(false)
  if (!workers || !sessions) return <p className="px-2 text-sm text-gray-400">loading…</p>
  const groups = groupByWorker(workers, sessions)
  return (
    <div className="flex flex-col gap-3">
      {workers.length === 0 ? (
        <p className="px-2 text-sm text-gray-400">No workers yet.</p>
      ) : (
        groups.map(g => (
          <WorkerGroup
            key={g.worker.id}
            worker={g.worker}
            sessions={g.sessions}
            projectId={projectId}
            activeId={activeId}
            open={open}
            close={close}
          />
        ))
      )}
      {/* A worker is a daemon on a machine, so "add" opens a guide (install +
          token + register), not a server-side create. */}
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex w-fit items-center gap-1 px-1 text-xs text-gray-400 transition-colors hover:text-blue-700"
      >
        ＋ Add worker
      </button>
      {adding && <AddWorker projectId={projectId} onClose={() => setAdding(false)} />}
    </div>
  )
}
