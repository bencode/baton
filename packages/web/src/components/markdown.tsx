import { Children, Component, isValidElement, lazy, type ReactNode, Suspense } from 'react'
import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import type { PluggableList } from 'unified'
import { normalizeMath } from './math-normalize'
import { markMermaidFences } from './remark-mermaid'

// Thin wrapper around react-markdown with @tailwindcss/typography styling.
//
// `prose-*` variants ride typography's CSS-variable-driven defaults, which
// makes overriding the dark `pre` colour squirrelly: `prose-pre:text-gray-800`
// loses to `--tw-prose-pre-code` in some build chains. Use descendant
// selectors (`[&_pre]:…`) instead — they win cleanly and read top-to-bottom.
//
// Heading scale shrunk one step from prose-sm's article defaults so the bubble
// doesn't shout. Tighten vertical margins for chat density.
type MarkdownProps = {
  text: string
  variant?: 'default' | 'chat' | 'process' | 'reader'
  // Reader extensions (file tabs); chat and other callers leave them unset.
  rehypePlugins?: PluggableList
  components?: Components
  skipHtml?: boolean
}

const LazyMermaidDiagram = lazy(() =>
  import('./mermaid-diagram').then(module => ({ default: module.MermaidDiagram })),
)

class MermaidBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: Error) {
    console.warn('[mermaid] component loading or rendering failed', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

const ChatCodeBlock: Components['pre'] = ({ children, node: _node, ...props }) => {
  const child = Children.toArray(children).find(isValidElement)
  const language =
    isValidElement<{ className?: string }>(child) &&
    child.props.className?.match(/(?:^|\s)language-(\S+)/)?.[1]
  const sourceBlock = (
    <section className="chat-code-block" aria-label={`${language || '代码'}，可横向滚动`}>
      {language && <div className="chat-code-label">{language}</div>}
      {/* biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users must be able to scroll long code lines. */}
      <pre {...props} tabIndex={0}>
        {children}
      </pre>
    </section>
  )
  if (
    !isValidElement<{ children?: string; 'data-mermaid-complete'?: string }>(child) ||
    child.props['data-mermaid-complete'] !== 'true' ||
    typeof child.props.children !== 'string'
  )
    return sourceBlock
  const source = child.props.children.replace(/\n$/, '')
  return (
    <MermaidBoundary
      key={source}
      fallback={
        <div className="chat-mermaid">
          <p className="chat-mermaid-status" role="alert">
            图表未能渲染，已保留源码
          </p>
          {sourceBlock}
        </div>
      }
    >
      <Suspense
        fallback={
          <div className="chat-mermaid">
            <p className="chat-mermaid-status" role="status">
              正在生成图表…
            </p>
            {sourceBlock}
          </div>
        }
      >
        <LazyMermaidDiagram source={source}>{sourceBlock}</LazyMermaidDiagram>
      </Suspense>
    </MermaidBoundary>
  )
}

const ChatTable: Components['table'] = ({ node: _node, ...props }) => (
  // biome-ignore lint/a11y/noNoninteractiveTabindex: the region is a horizontal scroll container, not a static section.
  <section className="chat-table" aria-label="表格，可横向滚动" tabIndex={0}>
    <table {...props} />
  </section>
)

const variantClass = {
  chat: 'chat-markdown',
  process: 'chat-markdown chat-markdown-process',
  reader: 'reader-markdown',
}

export const Markdown = ({
  text,
  variant = 'default',
  rehypePlugins = [],
  components,
  skipHtml,
}: MarkdownProps) => (
  <div
    className={
      variant !== 'default'
        ? variantClass[variant]
        : [
            'prose prose-sm max-w-none break-words',
            'prose-headings:font-semibold',
            'prose-h1:text-lg prose-h1:mt-3 prose-h1:mb-1.5',
            'prose-h2:text-base prose-h2:mt-2.5 prose-h2:mb-1',
            'prose-h3:text-sm prose-h3:mt-2 prose-h3:mb-0.5',
            'prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5',
            'prose-blockquote:my-2 prose-blockquote:not-italic',
            // fenced code blocks: light bg, dark text — visible without dark mode
            '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:border [&_pre]:border-gray-200',
            '[&_pre]:bg-gray-50 [&_pre]:text-gray-800 [&_pre]:p-3 [&_pre]:text-xs',
            '[&_pre_code]:bg-transparent [&_pre_code]:text-gray-800',
            '[&_pre_code]:p-0 [&_pre_code]:font-normal',
            // inline code: subtle pill, drop prose's backtick pseudos
            '[&_:not(pre)>code]:bg-gray-100 [&_:not(pre)>code]:text-gray-800',
            '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:py-0.5',
            '[&_:not(pre)>code]:font-normal [&_:not(pre)>code]:text-[0.85em]',
            'prose-code:before:hidden prose-code:after:hidden',
            // KaTeX block math: keep prose density, let long equations scroll sideways
            // instead of overflowing the bubble.
            '[&_.katex-display]:my-2 [&_.katex-display]:overflow-x-auto [&_.katex-display]:overflow-y-hidden',
            // GFM tables: a wide table scrolls within the bubble instead of stretching
            // the column and forcing the whole transcript to scroll sideways on mobile.
            '[&_table]:block [&_table]:w-max [&_table]:max-w-full [&_table]:overflow-x-auto',
          ].join(' ')
    }
  >
    <ReactMarkdown
      remarkPlugins={
        variant === 'chat' || variant === 'reader'
          ? [remarkGfm, remarkMath, markMermaidFences]
          : [remarkGfm, remarkMath]
      }
      rehypePlugins={[rehypeKatex, ...rehypePlugins]}
      skipHtml={skipHtml}
      components={{
        ...(variant !== 'default' ? { pre: ChatCodeBlock, table: ChatTable } : {}),
        // Open links in a new tab (the transcript is the app; don't navigate away).
        a: ({ node: _node, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        ...components,
      }}
    >
      {normalizeMath(text)}
    </ReactMarkdown>
  </div>
)
