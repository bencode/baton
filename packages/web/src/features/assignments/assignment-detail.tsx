import type { AssignmentEvent, Code, Id } from '@baton/shared'
import { StatusBadge } from '../../components/status-badge'
import { useAssignmentStream } from './use-assignment-stream'
import { useAssignmentByCode } from './use-assignments'

type AssignmentDetailProps = { projectId: Id; code: Code }

// Live view: header (code/task/session/status) + scrolling event tail.
export const AssignmentDetail = ({ projectId, code }: AssignmentDetailProps) => {
  const { data: assignment, loading } = useAssignmentByCode(projectId, code)
  const { events, status } = useAssignmentStream(assignment?.id ?? null)
  if (loading) return <div className="p-6 text-sm text-gray-400">loading…</div>
  if (!assignment) return <div className="p-6 text-sm text-gray-400">assignment not found</div>
  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 flex-col gap-2 border-b border-gray-200 p-6">
        <div className="flex items-center gap-1.5 text-xs tracking-wider text-gray-500 uppercase">
          <span>Assignment</span>
          <span aria-hidden="true" className="text-gray-300">
            ·
          </span>
          <span className="font-mono normal-case tracking-normal text-gray-400">
            {assignment.code}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">
            task #{assignment.taskId} · session #{assignment.sessionId}
          </h2>
          <StatusBadge status={assignment.status} />
          <span className="text-xs text-gray-400">stream: {status}</span>
        </div>
        {assignment.result && <p className="text-sm text-gray-600">{assignment.result}</p>}
      </div>
      <div className="flex-1 overflow-auto bg-gray-50 p-4">
        {events.length === 0 ? (
          <p className="text-sm text-gray-400">no events yet…</p>
        ) : (
          <ul className="flex flex-col gap-1 font-mono text-xs text-gray-700">
            {events.map(e => (
              <EventRow key={e.sequence} event={e} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

const EventRow = ({ event }: { event: AssignmentEvent }) => {
  const payload = event.payload as { type?: string }
  const label = payload?.type ?? 'event'
  return (
    <li className="flex items-start gap-2 rounded border border-gray-200 bg-white p-2">
      <span className="shrink-0 text-gray-400">#{event.sequence}</span>
      <span className="shrink-0 rounded bg-gray-100 px-1.5 text-gray-600">{label}</span>
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-words text-gray-800">
        {JSON.stringify(event.payload, null, 2)}
      </pre>
    </li>
  )
}
