import { lazy, Suspense } from 'react'
import { ReaderLoading, type TextFileView } from './code-file'
import { FilePage, type FileShell } from './file-page'

// Mermaid itself loads with the first diagram.
const MermaidRenderer = lazy(() =>
  import('../../components/renderers/mermaid/mermaid-renderer').then(module => ({
    default: module.MermaidRenderer,
  })),
)

// A Mermaid file, drawn; its source folds out under the diagram.
export const MermaidFile = ({ shell, view }: { shell: FileShell; view: TextFileView }) => (
  <FilePage shell={shell}>
    <Suspense fallback={<ReaderLoading />}>
      <MermaidRenderer source={view.content} />
    </Suspense>
  </FilePage>
)
