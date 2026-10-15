import type { Id, WorkerView } from '@baton/shared'
import { useApi } from '../../app/api-context'
import { servicePath } from '../../app/route'
import { ServiceRow } from './service-row'
import { useServices } from './use-services'

type ServicesPanelProps = {
  projectId: Id
  workers: WorkerView[] | null
  activeId: string
  open: (id: string, title: string) => void
}

export const ServicesPanel = ({ projectId, workers, activeId, open }: ServicesPanelProps) => {
  const api = useApi()
  const { data: services, loading, error, refresh } = useServices(projectId)
  const workerNames = new Map(workers?.map(worker => [worker.id, worker.name]))
  const ordered = [...(services ?? [])].sort(
    (a, b) => a.workerId - b.workerId || a.name.localeCompare(b.name),
  )

  return (
    <section className="flex flex-col gap-3">
      <h1 className="ui-page-title mb-2">Services</h1>
      {loading && services === null && <p className="px-2 text-sm text-ui-muted">loading…</p>}
      {!loading && error && services === null && (
        <p role="alert" className="px-2 text-sm text-ui-danger">
          Unable to load services.
        </p>
      )}
      {!loading && !error && ordered.length === 0 && (
        <div className="rounded-md bg-ui-panel p-4 text-sm text-ui-muted">
          <p>No services running.</p>
          <p className="mt-0.5">
            Start one with{' '}
            <code className="font-mono">baton service run NAME --cwd DIR -- COMMAND</code>.
          </p>
        </div>
      )}
      {error && services !== null && (
        <p role="status" className="px-2 text-[11px] text-ui-warning">
          Services may be out of date.
        </p>
      )}
      {ordered.map(service => {
        const path = servicePath(projectId, service.workerId, service.name)
        return (
          <ServiceRow
            key={`${service.workerId}/${service.name}`}
            service={service}
            workerName={workerNames.get(service.workerId) ?? `W-${service.workerId}`}
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
