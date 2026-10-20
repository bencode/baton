import type { FileView } from '@baton/shared'
import { useState } from 'react'
import { useApi } from '../../app/api-context'
import { fileRoutePath, type Route } from '../../app/route'
import { BranchIcon, CopyIcon, RefreshIcon } from '../../components/icons'
import { fileErrorMessage, formatFileSize } from './file-messages'
import { useFileQuery } from './use-file-query'
import './files.css'

type FileRoute = Extract<Route, { kind: 'file' }>

const FileBody = ({ view }: { view: FileView }) => {
  if (view.kind === 'text') return <pre className="files-text">{view.content}</pre>
  return (
    <p className="files-notice">
      {view.kind === 'binary'
        ? `二进制文件（${formatFileSize(view.size)}），不提供预览。`
        : `文件大小 ${formatFileSize(view.size)}，超过 ${formatFileSize(view.limit)} 上限，不提供预览。`}
    </p>
  )
}

// One file of one worker branch, read when the tab is first shown and again only on
// refresh. Errors stay on this file: nothing falls back to another branch or worker.
export const FileTab = ({ route }: { route: FileRoute }) => {
  const api = useApi()
  const { workerId, branch, path } = route
  const file = useFileQuery(`view:${workerId}:${branch}:${path}`, signal =>
    api.files.view({ workerId, branch }, path, signal),
  )
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  const name = path.split('/').at(-1) ?? path

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${fileRoutePath(route)}`)
      setCopy('copied')
    } catch (error) {
      console.error('[files] could not copy the file link', error)
      setCopy('failed')
    }
  }

  return (
    <div className="files-page">
      <header className="files-page-header">
        <div className="min-w-0">
          <h2 className="files-page-title" title={path}>
            {name}
          </h2>
          <p className="files-page-meta">
            <BranchIcon />
            <span className="truncate">{branch}</span>
            {file.data && (
              <span className="shrink-0">
                {file.data.commit === null
                  ? '· 工作目录'
                  : `· 提交 ${file.data.commit.slice(0, 7)}`}
              </span>
            )}
            <span aria-hidden>·</span>
            <span className="truncate font-mono">{path}</span>
            {file.data && <span className="shrink-0">· {formatFileSize(file.data.size)}</span>}
          </p>
        </div>
        <div className="files-page-actions">
          {copy !== 'idle' && (
            <span role="status" className="text-xs text-ui-muted">
              {copy === 'copied' ? '已复制链接' : '复制失败'}
            </span>
          )}
          <button
            type="button"
            className="ui-icon-button"
            aria-label="复制链接"
            title="复制链接"
            onClick={() => void copyLink()}
          >
            <CopyIcon />
          </button>
          <button
            type="button"
            className="ui-icon-button"
            aria-label="刷新文件"
            title="刷新文件"
            onClick={file.reload}
          >
            <RefreshIcon />
          </button>
        </div>
      </header>
      {file.error && (
        <p role="alert" className="files-notice text-ui-danger">
          {fileErrorMessage(file.error)}
          <button type="button" className="ml-2 underline" onClick={file.reload}>
            重试
          </button>
        </p>
      )}
      {!file.error && file.data && <FileBody view={file.data} />}
      {!file.error && !file.data && file.loading && (
        <p role="status" className="files-notice">
          加载文件…
        </p>
      )}
    </div>
  )
}
