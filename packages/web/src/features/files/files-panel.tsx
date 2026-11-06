import type { Id } from '@baton/shared'
import { type ReactNode, useMemo, useState } from 'react'
import { projectViewPath } from '../../app/route'
import { RefreshIcon } from '../../components/icons'
import { useWorkers } from '../workers/use-workers'
import { groupByDirectory } from './directory-groups'
import type { TreeEnv } from './directory-node'
import { useTreeToggles } from './tree-toggles'
import { WorkerNode } from './worker-node'

type FilesPanelProps = {
  projectId: Id
  activeId: string
  open(path: string, title: string): void
  renderToolbar(actions: ReactNode): ReactNode
}

// Files belong to workers' directories: the tree is directory → checked-out branch
// → files, each level requested only when expanded. Workers sharing a directory are
// one node, and the first online one starts expanded.
export const FilesPanel = ({ projectId, activeId, open, renderToolbar }: FilesPanelProps) => {
  const workers = useWorkers(projectId)
  const toggles = useTreeToggles()
  const [refreshKey, setRefreshKey] = useState(0)
  const env: TreeEnv = useMemo(
    () => ({ projectId, toggles, refreshKey, activeId, open }),
    [projectId, toggles, refreshKey, activeId, open],
  )
  const refresh = () => {
    setRefreshKey(value => value + 1)
    workers.refresh()
  }
  const groups = groupByDirectory(workers.data ?? [])
  const firstOnline = groups.find(group => group.host.connected)
  return (
    <section aria-label="Files" className="wb-category-panel">
      {renderToolbar(
        <div className="wb-list-actions">
          <button
            type="button"
            className="ui-icon-button"
            aria-label="刷新文件"
            title="刷新文件"
            onClick={refresh}
          >
            <RefreshIcon />
          </button>
        </div>,
      )}
      <div className="files-tree">
        {workers.loading && workers.data === null && (
          <p role="status" className="files-panel-note">
            加载执行环境…
          </p>
        )}
        {workers.error && (
          <p role="alert" className="files-panel-note text-ui-danger">
            无法加载执行环境。
            <button type="button" className="ml-1 underline" onClick={workers.refresh}>
              重试
            </button>
          </p>
        )}
        {workers.data?.length === 0 && (
          <div className="files-panel-note">
            <p>该项目还没有执行环境。</p>
            <button
              type="button"
              className="ui-button mt-2"
              onClick={() => open(projectViewPath(projectId, 'workers'), '执行环境')}
            >
              管理执行环境
            </button>
          </div>
        )}
        {groups.map(group => (
          <WorkerNode
            key={group.key}
            env={env}
            group={group}
            defaultOpen={group.key === firstOnline?.key}
          />
        ))}
      </div>
    </section>
  )
}
