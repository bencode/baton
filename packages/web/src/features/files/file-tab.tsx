import type { FileView } from '@baton/shared'
import { lazy, Suspense, useState } from 'react'
import { useApi } from '../../app/api-context'
import { fileRoutePath, type Route } from '../../app/route'
import { BranchIcon, CopyIcon, RefreshIcon } from '../../components/icons'
import { fileKindFor } from './file-kind'
import { fileErrorMessage, formatFileSize } from './file-messages'
import { useFileQuery } from './use-file-query'

type FileRoute = Extract<Route, { kind: 'file' }>
type Mode = 'rendered' | 'source'

// Highlighting and Markdown plugins load only when a document is first rendered.
const MarkdownReader = lazy(() =>
  import('./markdown-reader').then(module => ({ default: module.MarkdownReader })),
)

const FileBody = ({ route, view, mode }: { route: FileRoute; view: FileView; mode: Mode }) => {
  if (view.kind === 'text')
    return mode === 'rendered' ? (
      <Suspense
        fallback={
          <p role="status" className="files-notice">
            加载阅读器…
          </p>
        }
      >
        <MarkdownReader route={route} content={view.content} />
      </Suspense>
    ) : (
      <pre className="files-text">{view.content}</pre>
    )
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
  const markdown = fileKindFor(path) === 'markdown'
  const [mode, setMode] = useState<Mode>('rendered')
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
            <span className="max-w-[40%] shrink-0 truncate">{branch}</span>
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
          {markdown && (
            <fieldset className="files-mode" aria-label="显示方式">
              {(['rendered', 'source'] as const).map(value => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={mode === value}
                  onClick={() => setMode(value)}
                >
                  {value === 'rendered' ? '渲染' : '源码'}
                </button>
              ))}
            </fieldset>
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
      {!file.error && file.data && (
        <FileBody route={route} view={file.data} mode={markdown ? mode : 'source'} />
      )}
      {!file.error && !file.data && file.loading && (
        <p role="status" className="files-notice">
          加载文件…
        </p>
      )}
    </div>
  )
}
