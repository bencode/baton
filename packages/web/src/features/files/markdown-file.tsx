import { lazy, Suspense, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApi } from '../../app/api-context'
import { fileRoutePath } from '../../app/route'
import { AppearanceControl } from '../../components/renderers/markdown/appearance-control'
import type { MarkdownLink } from '../../components/renderers/markdown/markdown-renderer'
import { useIsMobile } from '../../hooks/use-media-query'
import { ReaderLoading, type TextFileView, useCodeView } from './code-file'
import { FilePage, type FileShell } from './file-page'
import { useReadingPreferences } from './reading-preferences'
import { classifyLink, resolveRelativePath } from './relative-link'

type Mode = 'rendered' | 'source'

// Markdown plugins load with the first rendered document.
const MarkdownRenderer = lazy(() =>
  import('../../components/renderers/markdown/markdown-renderer').then(module => ({
    default: module.MarkdownRenderer,
  })),
)

// A Markdown file: a document in the reading appearance, or its source in the
// code view. Relative links open the target in the same worker and branch, and
// relative images load from there; other images stay placeholders. Phones always
// show the document.
export const MarkdownFile = ({ shell, view }: { shell: FileShell; view: TextFileView }) => {
  const api = useApi()
  const navigate = useNavigate()
  const mobile = useIsMobile()
  const [mode, setMode] = useState<Mode>('rendered')
  const shown: Mode = mobile ? 'rendered' : mode
  const [preferences, setPreferences] = useReadingPreferences()
  const code = useCodeView(view)
  const { route } = shell

  const link = (href: string): MarkdownLink => {
    const target = classifyLink(view.path, href)
    if (target.kind !== 'file') return target
    const path = fileRoutePath({ ...route, path: target.path })
    return { kind: 'internal', href: path, open: () => navigate(path) }
  }
  const image = (src: string): string | null => {
    const path = resolveRelativePath(view.path, src)
    return path === null
      ? null
      : api.files.rawUrl({ workerId: route.workerId, branch: route.branch }, path)
  }

  const tools = (
    <>
      {shown === 'rendered' ? (
        <AppearanceControl
          value={preferences}
          onChange={appearance => setPreferences({ ...preferences, ...appearance })}
        />
      ) : (
        code.tools
      )}
      {!mobile && (
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
    </>
  )
  return (
    <FilePage shell={shell} tools={tools} fill={shown === 'source'}>
      {shown === 'rendered' ? (
        <Suspense fallback={<ReaderLoading />}>
          <MarkdownRenderer
            content={view.content}
            appearance={preferences}
            link={link}
            image={image}
          />
        </Suspense>
      ) : (
        code.body
      )}
    </FilePage>
  )
}
