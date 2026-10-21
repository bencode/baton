import { lazy, Suspense, useState } from 'react'
import { useApi } from '../../app/api-context'
import { useIsMobile } from '../../hooks/use-media-query'
import { ReaderLoading, type TextFileView, useCodeView } from './code-file'
import { FilePage, type FileShell } from './file-page'
import { ViewModeToggle } from './view-mode'

type Mode = 'preview' | 'source'
const MODES: readonly { value: Mode; label: string }[] = [
  { value: 'preview', label: '预览' },
  { value: 'source', label: '源码' },
]

const HtmlRenderer = lazy(() =>
  import('../../components/renderers/html/html-renderer').then(module => ({
    default: module.HtmlRenderer,
  })),
)

// An HTML file: a preview that loads the page's own stylesheets, images, and fonts
// from the same branch but runs no scripts, or its source. Phones show the preview.
export const HtmlFile = ({ shell, view }: { shell: FileShell; view: TextFileView }) => {
  const api = useApi()
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('preview')
  const shown: Mode = mobile ? 'preview' : mode
  const code = useCodeView(view)
  const { workerId, branch } = shell.route
  const root = api.files.rawRoot({ workerId, branch })
  const folder = view.path.split('/').slice(0, -1)
  const directory = `${root}${folder.map(segment => `${encodeURIComponent(segment)}/`).join('')}`

  const tools = (
    <>
      {shown === 'source' && code.tools}
      {!mobile && <ViewModeToggle value={mode} options={MODES} onChange={setMode} />}
    </>
  )
  return (
    <FilePage shell={shell} tools={tools} fill>
      {shown === 'preview' ? (
        <Suspense fallback={<ReaderLoading />}>
          <HtmlRenderer html={view.content} title={view.name} resources={{ directory, root }} />
        </Suspense>
      ) : (
        code.body
      )}
    </FilePage>
  )
}
