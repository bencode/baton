import type { FileView } from '@baton/shared'
import { type ReactNode, useState } from 'react'
import { fileRoutePath, type Route } from '../../app/route'
import { BranchIcon, CopyIcon, RefreshIcon } from '../../components/icons'
import { formatFileSize } from './file-messages'

export type FileRoute = Extract<Route, { kind: 'file' }>

// What every renderer shares about the open file.
export type FileShell = {
  route: FileRoute
  // Commit and size for the header; null while the file first loads.
  view: FileView | null
  // Bumped on every refresh so renderers that fetch more than the view refetch too.
  revision: number
  refresh(): void
}

// The page around every file renderer: name, branch, commit, path, size, the
// renderer's own tools, copy link, and refresh.
export const FilePage = ({
  shell,
  tools,
  fill = false,
  children,
}: {
  shell: FileShell
  tools?: ReactNode
  // Editors scroll inside themselves, so the page is held to the tab height.
  fill?: boolean
  children: ReactNode
}) => {
  const { route, view } = shell
  const { branch, path } = route
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
    <div className={fill ? 'files-page files-page-fill' : 'files-page'}>
      <header className="files-page-header">
        <div className="min-w-0">
          <h2 className="files-page-title" title={path}>
            {name}
          </h2>
          <p className="files-page-meta">
            <BranchIcon />
            <span className="max-w-[40%] shrink-0 truncate">{branch}</span>
            {view && (
              <span className="shrink-0">
                {view.commit === null ? '· 工作目录' : `· 提交 ${view.commit.slice(0, 7)}`}
              </span>
            )}
            <span aria-hidden>·</span>
            <span className="truncate font-mono">{path}</span>
            {view && <span className="shrink-0">· {formatFileSize(view.size)}</span>}
          </p>
        </div>
        <div className="files-page-actions">
          {copy !== 'idle' && (
            <span role="status" className="text-xs text-ui-muted">
              {copy === 'copied' ? '已复制链接' : '复制失败'}
            </span>
          )}
          {tools}
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
            onClick={shell.refresh}
          >
            <RefreshIcon />
          </button>
        </div>
      </header>
      {children}
    </div>
  )
}
