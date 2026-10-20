import type { FileEntry, Id } from '@baton/shared'
import type { CSSProperties, ReactNode } from 'react'
import type { FileScope } from '../../api/files'
import { useApi } from '../../app/api-context'
import { fileRoutePath } from '../../app/route'
import { ChevronDownIcon, FileIcon, FolderIcon } from '../../components/icons'
import { fileErrorMessage } from './file-messages'
import type { TreeToggles } from './tree-toggles'
import { useFileQuery } from './use-file-query'

// What every node of the files tree needs from the panel.
export type TreeEnv = {
  projectId: Id
  toggles: TreeToggles
  refreshKey: number
  activeId: string
  open(path: string, title: string): void
}

export const indent = (depth: number): CSSProperties =>
  ({ '--files-depth': depth }) as CSSProperties

type TreeRowProps = {
  depth: number
  icon: ReactNode
  label: ReactNode
  title?: string
  expanded?: boolean
  current?: boolean
  onClick(): void
  actions?: ReactNode
}

// A row is a main button plus optional sibling actions (buttons cannot nest).
export const TreeRow = ({
  depth,
  icon,
  label,
  title,
  expanded,
  current,
  onClick,
  actions,
}: TreeRowProps) => (
  <div className="files-row" style={indent(depth)}>
    <button
      type="button"
      className="files-row-main"
      title={title}
      aria-expanded={expanded}
      aria-current={current ? 'page' : undefined}
      onClick={onClick}
    >
      {expanded === undefined ? (
        <span className="files-chevron" />
      ) : (
        <span className="files-chevron">
          <ChevronDownIcon />
        </span>
      )}
      {icon}
      <span className="files-row-label">{label}</span>
    </button>
    {actions}
  </div>
)

export const TreeMessage = ({
  depth,
  danger,
  children,
}: {
  depth: number
  danger?: boolean
  children: ReactNode
}) => (
  <p
    role={danger ? 'alert' : 'status'}
    className={`files-message${danger ? ' text-ui-danger' : ''}`}
    style={indent(depth)}
  >
    {children}
  </p>
)

export const FileRow = ({
  env,
  scope,
  entry,
  depth,
  label = entry.name,
}: {
  env: TreeEnv
  scope: FileScope
  entry: FileEntry
  depth: number
  label?: string
}) => {
  const target = fileRoutePath({
    projectId: env.projectId,
    workerId: scope.workerId,
    branch: scope.branch,
    path: entry.path,
  })
  return (
    <TreeRow
      depth={depth}
      icon={<FileIcon />}
      label={label}
      title={entry.path}
      current={env.activeId === target}
      onClick={() => env.open(target, entry.name)}
    />
  )
}

const DirectoryNode = ({
  env,
  scope,
  entry,
  depth,
}: {
  env: TreeEnv
  scope: FileScope
  entry: FileEntry
  depth: number
}) => {
  const key = `d:${scope.workerId}:${scope.branch}:${entry.path}`
  const open = env.toggles.isOpen(key, false)
  return (
    <>
      <TreeRow
        depth={depth}
        icon={<FolderIcon />}
        label={entry.name}
        title={entry.path}
        expanded={open}
        onClick={() => env.toggles.toggle(key)}
      />
      {open && <DirectoryChildren env={env} scope={scope} path={entry.path} depth={depth + 1} />}
    </>
  )
}

// One directory level, requested only while its parent node is expanded.
export const DirectoryChildren = ({
  env,
  scope,
  path,
  depth,
}: {
  env: TreeEnv
  scope: FileScope
  path: string
  depth: number
}) => {
  const api = useApi()
  const listing = useFileQuery(
    `list:${scope.workerId}:${scope.branch}:${path}`,
    signal => api.files.list(scope, path, signal),
    env.refreshKey,
  )
  if (listing.error)
    return (
      <TreeMessage depth={depth} danger>
        {fileErrorMessage(listing.error)}
        <button type="button" className="ml-2 underline" onClick={listing.reload}>
          重试
        </button>
      </TreeMessage>
    )
  if (!listing.data) return <TreeMessage depth={depth}>加载中…</TreeMessage>
  return (
    <>
      {listing.data.entries.map(entry =>
        entry.kind === 'directory' ? (
          <DirectoryNode key={entry.path} env={env} scope={scope} entry={entry} depth={depth} />
        ) : (
          <FileRow key={entry.path} env={env} scope={scope} entry={entry} depth={depth} />
        ),
      )}
      {listing.data.entries.length === 0 && <TreeMessage depth={depth}>空目录</TreeMessage>}
      {listing.data.truncated && (
        <TreeMessage depth={depth}>仅显示前 2000 项，可用搜索定位</TreeMessage>
      )}
    </>
  )
}
