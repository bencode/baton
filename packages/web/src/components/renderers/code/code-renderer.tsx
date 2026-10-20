import { LanguageDescription, syntaxHighlighting } from '@codemirror/language'
import { openSearchPanel, search } from '@codemirror/search'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { classHighlighter } from '@lezer/highlight'
import { basicSetup, EditorView } from 'codemirror'
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type CodeRendererHandle = { openSearch(): void }

// A grammar is fetched the first time a file in its language is opened; a name no
// grammar claims reads as plain text.
const languageFor = async (name: string): Promise<Extension[]> => {
  const { languages } = await import('@codemirror/language-data')
  const description = LanguageDescription.matchFilename(languages, name)
  return description ? [await description.load()] : []
}

const wrapping = (wrap: boolean): Extension => (wrap ? EditorView.lineWrapping : [])

// The first line on screen, so a rebuilt view (tab hidden and shown again) returns to it.
const topLine = (view: EditorView): number => {
  const top = Math.max(view.scrollDOM.scrollTop - view.documentPadding.top, 0)
  return view.state.doc.lineAt(view.lineBlockAtHeight(top).from).number
}

// Read-only source with syntax colours by file name, line numbers, folding, and
// search (Cmd/Ctrl-F or openSearch). It keeps one fixed editor look; colours come
// from `tok-*` classes styled in code-renderer.css.
export const CodeRenderer = ({
  name,
  content,
  wrap,
  ref,
}: {
  name: string
  content: string
  wrap: boolean
  ref?: Ref<CodeRendererHandle>
}) => {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const lineWrap = useRef(new Compartment())
  const latestWrap = useRef(wrap)
  latestWrap.current = wrap
  const resumeLine = useRef<number | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useImperativeHandle(ref, () => ({
    openSearch: () => {
      if (view.current) openSearchPanel(view.current)
    },
  }))

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the retry trigger
  useEffect(() => {
    const parent = host.current
    if (!parent) return
    let disposed = false
    setFailed(false)
    languageFor(name).then(
      language => {
        if (disposed) return
        const created = new EditorView({
          parent,
          state: EditorState.create({
            doc: content,
            extensions: [
              basicSetup,
              // The search panel opens under the tab header rather than at the bottom.
              search({ top: true }),
              syntaxHighlighting(classHighlighter),
              language,
              EditorState.readOnly.of(true),
              EditorView.contentAttributes.of({ 'aria-label': `${name} 源码` }),
              lineWrap.current.of(wrapping(latestWrap.current)),
            ],
          }),
        })
        view.current = created
        const line = resumeLine.current
        if (line !== null && line <= created.state.doc.lines)
          created.dispatch({
            effects: EditorView.scrollIntoView(created.state.doc.line(line).from, { y: 'start' }),
          })
      },
      error => {
        console.error('[code-renderer] could not load the editor', error)
        if (!disposed) setFailed(true)
      },
    )
    return () => {
      disposed = true
      if (view.current) {
        resumeLine.current = topLine(view.current)
        view.current.destroy()
      }
      view.current = null
    }
  }, [name, content, attempt])

  useEffect(() => {
    view.current?.dispatch({ effects: lineWrap.current.reconfigure(wrapping(wrap)) })
  }, [wrap])

  return (
    <div className="code-renderer">
      {failed ? (
        <p role="alert" className="code-renderer-error">
          无法加载源码视图。
          <button type="button" className="ml-2 underline" onClick={() => setAttempt(n => n + 1)}>
            重试
          </button>
        </p>
      ) : (
        <div ref={host} className="code-renderer-editor" />
      )}
    </div>
  )
}
