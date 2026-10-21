import type { FileView } from '@baton/shared'
import { type ComponentType, useState } from 'react'
import { useApi } from '../../app/api-context'
import { CodeFile, type TextFileView } from './code-file'
import { type FileKind, fileKindFor } from './file-kind'
import { fileErrorMessage, formatFileSize } from './file-messages'
import { FilePage, type FileRoute, type FileShell } from './file-page'
import { HtmlFile } from './html-file'
import { ImageFile } from './image-file'
import { MarkdownFile } from './markdown-file'
import { MermaidFile } from './mermaid-file'
import { useFileQuery } from './use-file-query'

const TEXT_FILES: Record<FileKind, ComponentType<{ shell: FileShell; view: TextFileView }>> = {
  markdown: MarkdownFile,
  html: HtmlFile,
  mermaid: MermaidFile,
  source: CodeFile,
}

// Each kind of file opens in its own renderer, which brings its own tools.
const renderFile = (shell: FileShell, view: FileView) => {
  if (view.kind === 'image') return <ImageFile shell={shell} view={view} />
  if (view.kind === 'text') {
    const TextFile = TEXT_FILES[fileKindFor(view.path)]
    return <TextFile shell={shell} view={view} />
  }
  return (
    <FilePage shell={shell}>
      <p className="files-notice">
        {view.kind === 'binary'
          ? `二进制文件（${formatFileSize(view.size)}），不提供预览。`
          : `文件大小 ${formatFileSize(view.size)}，超过 ${formatFileSize(view.limit)} 上限，不提供预览。`}
      </p>
    </FilePage>
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
  const [revision, setRevision] = useState(0)
  const shell: FileShell = {
    route,
    view: file.data,
    revision,
    refresh: () => {
      setRevision(value => value + 1)
      file.reload()
    },
  }

  if (file.error)
    return (
      <FilePage shell={shell}>
        <p role="alert" className="files-notice text-ui-danger">
          {fileErrorMessage(file.error)}
          <button type="button" className="ml-2 underline" onClick={shell.refresh}>
            重试
          </button>
        </p>
      </FilePage>
    )
  if (file.data) return renderFile(shell, file.data)
  return (
    <FilePage shell={shell}>
      <p role="status" className="files-notice">
        加载文件…
      </p>
    </FilePage>
  )
}
