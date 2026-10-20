import type { FileView } from '@baton/shared'
import { lazy, Suspense, useRef } from 'react'
import type { CodeRendererHandle } from '../../components/renderers/code/code-renderer'
import { CodeTools } from '../../components/renderers/code/code-tools'
import { FilePage, type FileShell } from './file-page'
import { useReadingPreferences } from './reading-preferences'

export type TextFileView = Extract<FileView, { kind: 'text' }>

// CodeMirror loads with the first code view.
export const CodeRenderer = lazy(() =>
  import('../../components/renderers/code/code-renderer').then(module => ({
    default: module.CodeRenderer,
  })),
)

export const ReaderLoading = () => (
  <p role="status" className="files-notice">
    加载阅读器…
  </p>
)

// The code view of a text file, with wrapping remembered for every tab. Markdown
// files use it for their source.
export const useCodeView = (view: TextFileView) => {
  const [preferences, setPreferences] = useReadingPreferences()
  const editor = useRef<CodeRendererHandle>(null)
  const tools = (
    <CodeTools
      wrap={preferences.wrap}
      onWrapChange={wrap => setPreferences({ ...preferences, wrap })}
      onSearch={() => editor.current?.openSearch()}
    />
  )
  const body = (
    <Suspense fallback={<ReaderLoading />}>
      <CodeRenderer ref={editor} name={view.name} content={view.content} wrap={preferences.wrap} />
    </Suspense>
  )
  return { tools, body }
}

// Any text file that is not Markdown.
export const CodeFile = ({ shell, view }: { shell: FileShell; view: TextFileView }) => {
  const code = useCodeView(view)
  return (
    <FilePage shell={shell} tools={code.tools} fill>
      {code.body}
    </FilePage>
  )
}
