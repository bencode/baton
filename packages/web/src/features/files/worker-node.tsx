import type { FileBranch, Id, WorkerView } from '@baton/shared'
import { useEffect, useState } from 'react'
import type { FileScope } from '../../api/files'
import { useApi } from '../../app/api-context'
import { BranchIcon, CloseIcon, SearchIcon, WorkerIcon } from '../../components/icons'
import { DirectoryChildren, FileRow, type TreeEnv, TreeMessage, TreeRow } from './directory-node'
import { fileErrorMessage } from './file-messages'
import { useFileQuery } from './use-file-query'

const SEARCH_DEBOUNCE_MS = 300

const SearchResults = ({
  env,
  scope,
  query,
  depth,
}: {
  env: TreeEnv
  scope: FileScope
  query: string
  depth: number
}) => {
  const api = useApi()
  const results = useFileQuery(
    `search:${scope.workerId}:${scope.branch}:${query}`,
    signal => api.files.search(scope, query, signal),
    env.refreshKey,
  )
  if (results.error)
    return (
      <TreeMessage depth={depth} danger>
        {fileErrorMessage(results.error)}
        <button type="button" className="ml-2 underline" onClick={results.reload}>
          重试
        </button>
      </TreeMessage>
    )
  if (!results.data) return <TreeMessage depth={depth}>搜索中…</TreeMessage>
  return (
    <>
      {results.data.entries.map(entry => (
        <FileRow
          key={entry.path}
          env={env}
          scope={scope}
          entry={entry}
          depth={depth}
          label={entry.path}
        />
      ))}
      {results.data.entries.length === 0 && <TreeMessage depth={depth}>没有匹配的文件</TreeMessage>}
      {results.data.truncated && (
        <TreeMessage depth={depth}>
          {results.data.entries.length}+ 条，请输入更具体的关键词
        </TreeMessage>
      )}
    </>
  )
}

// A branch is its worktree's root directory; searching it swaps the children for
// a flat list of matches until the search is cleared.
const BranchNode = ({
  env,
  workerId,
  branch,
}: {
  env: TreeEnv
  workerId: Id
  branch: FileBranch
}) => {
  const key = `b:${workerId}:${branch.name}`
  const open = env.toggles.isOpen(key, branch.current)
  const scope: FileScope = { workerId, branch: branch.name }
  const [searching, setSearching] = useState(false)
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])
  const closeSearch = () => {
    setSearching(false)
    setText('')
    setQuery('')
  }
  return (
    <>
      <TreeRow
        depth={1}
        icon={<BranchIcon />}
        label={
          <>
            {branch.name}
            {branch.current && <span className="files-tag">执行环境目录</span>}
          </>
        }
        title={branch.path}
        expanded={open}
        onClick={() => env.toggles.toggle(key)}
        actions={
          <button
            type="button"
            className="ui-icon-button files-row-action"
            aria-label={`在 ${branch.name} 中搜索`}
            title="搜索文件"
            onClick={() => {
              setSearching(true)
              if (!open) env.toggles.toggle(key)
            }}
          >
            <SearchIcon />
          </button>
        }
      />
      {open && searching && (
        <label className="ui-search files-search">
          <SearchIcon />
          <input
            // biome-ignore lint/a11y/noAutofocus: the search box opens on an explicit click.
            autoFocus
            type="search"
            aria-label={`在 ${branch.name} 中按路径搜索`}
            placeholder="按文件路径搜索…"
            value={text}
            onChange={event => setText(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Escape') {
                event.preventDefault()
                closeSearch()
              }
            }}
          />
          <button
            type="button"
            className="ui-icon-button"
            aria-label="关闭搜索"
            title="关闭搜索"
            onClick={closeSearch}
          >
            <CloseIcon />
          </button>
        </label>
      )}
      {open &&
        (searching && query ? (
          <SearchResults env={env} scope={scope} query={query} depth={2} />
        ) : (
          <DirectoryChildren env={env} scope={scope} path="" depth={2} />
        ))}
    </>
  )
}

const BranchList = ({ env, workerId }: { env: TreeEnv; workerId: Id }) => {
  const api = useApi()
  const branches = useFileQuery(
    `branches:${workerId}`,
    signal => api.files.branches(workerId, signal),
    env.refreshKey,
  )
  if (branches.error)
    return (
      <TreeMessage depth={1} danger>
        {fileErrorMessage(branches.error)}
        <button type="button" className="ml-2 underline" onClick={branches.reload}>
          重试
        </button>
      </TreeMessage>
    )
  if (!branches.data) return <TreeMessage depth={1}>加载中…</TreeMessage>
  if (branches.data.length === 0)
    return (
      <TreeMessage depth={1}>
        没有可浏览的分支：执行环境目录需是 Git 仓库根目录并检出分支，非 Git 目录可执行 git init。
      </TreeMessage>
    )
  return branches.data.map(branch => (
    <BranchNode key={branch.name} env={env} workerId={workerId} branch={branch} />
  ))
}

// Worker → branches → files. An offline worker is shown but never queried.
export const WorkerNode = ({
  env,
  worker,
  defaultOpen,
}: {
  env: TreeEnv
  worker: WorkerView
  defaultOpen: boolean
}) => {
  const key = `w:${worker.id}`
  const open = env.toggles.isOpen(key, defaultOpen)
  return (
    <>
      <TreeRow
        depth={0}
        icon={<WorkerIcon />}
        label={
          <>
            {worker.name}
            {!worker.connected && <span className="files-tag">离线</span>}
          </>
        }
        title={worker.hostname}
        expanded={open}
        onClick={() => env.toggles.toggle(key)}
      />
      {open &&
        (worker.connected ? (
          <BranchList env={env} workerId={worker.id} />
        ) : (
          <TreeMessage depth={1}>执行环境离线</TreeMessage>
        ))}
    </>
  )
}
