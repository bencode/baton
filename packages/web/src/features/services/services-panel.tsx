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
    <section>
      <header className="mg-page-header">
        <div>
          <h1>服务</h1>
          <p className="mg-description">查看当前项目正在运行的服务。</p>
        </div>
        <button type="button" className="ui-button" onClick={refresh}>
          刷新
        </button>
      </header>
      {loading && services === null && (
        <p role="status" className="mg-feedback text-ui-muted">
          加载服务…
        </p>
      )}
      {!loading && error && services === null && (
        <p role="alert" className="mg-feedback text-ui-danger">
          无法加载服务。
          <button type="button" onClick={refresh} className="ml-2 underline">
            重试
          </button>
        </p>
      )}
      {!loading && !error && ordered.length === 0 && (
        <div className="mg-empty">
          <p>暂无运行中的服务。</p>
          <p className="mt-0.5">
            由 Agent 或命令行启动：{' '}
            <code className="break-all font-mono">baton service run NAME --cwd DIR -- COMMAND</code>
            。
          </p>
        </div>
      )}
      {error && services !== null && (
        <p role="status" className="mg-feedback text-ui-warning">
          服务信息可能不是最新状态。
        </p>
      )}
      <div>
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
      </div>
    </section>
  )
}
