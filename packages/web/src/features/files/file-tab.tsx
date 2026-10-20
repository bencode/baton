import type { FileView } from '@baton/shared'
import { lazy, type RefObject, Suspense, useRef, useState } from 'react'
import { useApi } from '../../app/api-context'
import { fileRoutePath, type Route } from '../../app/route'
import { BranchIcon, CopyIcon, RefreshIcon, SearchIcon, WrapIcon } from '../../components/icons'
import { fileKindFor } from './file-kind'
import { fileErrorMessage, formatFileSize } from './file-messages'
import { ImageView } from './image-view'
import { ReadingAppearance } from './reading-appearance'
import { useReadingPreferences } from './reading-preferences'
import type { SourceReaderHandle } from './source-reader'
import { useFileQuery } from './use-file-query'

type FileRoute = Extract<Route, { kind: 'file' }>
type Mode = 'rendered' | 'source'

// Both readers load on first use: Markdown plugins with the rendered view, and
// CodeMirror with the source view.
const MarkdownReader = lazy(() =>
  import('./markdown-reader').then(module => ({ default: module.MarkdownReader })),
)
const SourceReader = lazy(() =>
  import('./source-reader').then(module => ({ default: module.SourceReader })),
)

const FileBody = ({
  route,
  view,
  mode,
  wrap,
  source,
  revision,
}: {
  route: FileRoute
  view: FileView
  mode: Mode
  wrap: boolean
  source: RefObject<SourceReaderHandle | null>
  revision: number
}) => {
  const api = useApi()
  if (view.kind === 'image') {
    const src = api.files.rawUrl(
      { workerId: route.workerId, branch: route.branch },
      view.path,
      revision,
    )
    return <ImageView key={src} src={src} name={view.name} />
  }
  if (view.kind === 'text')
    return (
      <Suspense
        fallback={
          <p role="status" className="files-notice">
            加载阅读器…
          </p>
        }
      >
        {mode === 'rendered' ? (
          <MarkdownReader route={route} content={view.content} />
        ) : (
          <SourceReader ref={source} path={view.path} content={view.content} wrap={wrap} />
        )}
      </Suspense>
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
  const shownMode: Mode = markdown ? mode : 'source'
  const text = file.data?.kind === 'text'
  const [preferences, setPreferences] = useReadingPreferences()
  const source = useRef<SourceReaderHandle>(null)
  // Bumped on every refresh so image bytes are fetched again with the metadata.
  const [revision, setRevision] = useState(0)
  const refresh = () => {
    setRevision(value => value + 1)
    file.reload()
  }
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
    <div className={text && shownMode === 'source' ? 'files-page files-page-fill' : 'files-page'}>
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
          {text && shownMode === 'source' && (
            <>
              <button
                type="button"
                className="ui-icon-button"
                aria-label="在文件中搜索"
                title="在文件中搜索"
                onClick={() => source.current?.openSearch()}
              >
                <SearchIcon />
              </button>
              <button
                type="button"
                className="ui-icon-button"
                aria-label="自动换行"
                title="自动换行"
                aria-pressed={preferences.wrap}
                onClick={() => setPreferences({ ...preferences, wrap: !preferences.wrap })}
              >
                <WrapIcon />
              </button>
            </>
          )}
          {text && <ReadingAppearance />}
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
            onClick={refresh}
          >
            <RefreshIcon />
          </button>
        </div>
      </header>
      {file.error && (
        <p role="alert" className="files-notice text-ui-danger">
          {fileErrorMessage(file.error)}
          <button type="button" className="ml-2 underline" onClick={refresh}>
            重试
          </button>
        </p>
      )}
      {!file.error && file.data && (
        <FileBody
          route={route}
          view={file.data}
          mode={shownMode}
          wrap={preferences.wrap}
          source={source}
          revision={revision}
        />
      )}
      {!file.error && !file.data && file.loading && (
        <p role="status" className="files-notice">
          加载文件…
        </p>
      )}
    </div>
  )
}
