import type { Id, SessionView, WorkerView } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { servicePath } from '../../app/route'
import { ServiceRow } from './service-row'
import { useServices } from './use-services'

type ServicesPanelProps = {
  projectId: Id
  workers: WorkerView[] | null
  sessions: SessionView[] | null
  activeId: string
  open: (id: string, title: string) => void
}

export const ServicesPanel = ({
  projectId,
  workers,
  sessions,
  activeId,
  open,
}: ServicesPanelProps) => {
  const api = useApi()
  const { data: services, loading, error, refresh } = useServices(projectId)
  const workerNames = new Map(workers?.map(worker => [worker.id, worker.name]))
  const sessionNames = new Map(sessions?.map(session => [session.id, session.name]))
  const ordered = [...(services ?? [])].sort(
    (a, b) => a.workerId - b.workerId || a.name.localeCompare(b.name),
  )

  return (
    <section className="flex flex-col gap-1">
      <h2 className="mb-1 px-1 text-xs font-semibold tracking-wider text-gray-500 uppercase">
        Services
      </h2>
      {loading && services === null && <p className="px-2 text-sm text-gray-500">loading…</p>}
      {!loading && error && services === null && (
        <p role="alert" className="px-2 text-sm text-red-600">
          Unable to load services.
        </p>
      )}
      {!loading && !error && ordered.length === 0 && (
        <div className="px-2 text-xs text-gray-500">
          <p>No services running.</p>
          <p className="mt-0.5">
            Start one from a session with <code className="font-mono">baton service run</code>.
          </p>
        </div>
      )}
      {error && services !== null && (
        <p role="status" className="px-2 text-[11px] text-amber-700">
          Services may be out of date.
        </p>
      )}
      {ordered.map(service => {
        const sessionName = sessionNames.get(service.sessionId)
        const path = servicePath(projectId, service.workerId, service.name)
        return (
          <ServiceRow
            key={`${service.workerId}/${service.name}`}
            service={service}
            workerName={workerNames.get(service.workerId) ?? `W-${service.workerId}`}
            sessionName={sessionName ?? `session #${service.sessionId}`}
            active={activeId === path}
            open={() => open(path, `W-${service.workerId}/${service.name}`)}
            stop={async () => {
              await api.services.stop(service.workerId, service.name)
              refresh()
            }}
          />
        )
      })}
    </section>
  )
}
