import type { MouseEvent } from 'react'
import type { Components } from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'
import { fileRoutePath, type Route } from '../../app/route'
import { Markdown } from '../../components/markdown'
import { highlightLanguages } from './highlight-languages'
import { classifyLink } from './relative-link'

type FileRoute = Extract<Route, { kind: 'file' }>

const highlight: PluggableList = [
  [
    rehypeHighlight,
    {
      detect: false,
      languages: highlightLanguages,
      plainText: ['mermaid', 'text', 'txt', 'plaintext'],
    },
  ],
]

const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

// A rendered Markdown file. Relative links open the target in the same worker and
// branch; web links open a new browser tab; anything else is plain text. Images
// are placeholders and raw HTML is dropped, so the document never fetches from or
// runs anything on other origins.
export const MarkdownReader = ({ route, content }: { route: FileRoute; content: string }) => {
  const navigate = useNavigate()
  const components: Components = {
    a: ({ node: _node, href = '', children, ...props }) => {
      const target = classifyLink(route.path, href)
      if (target.kind === 'anchor')
        return (
          <a {...props} href={href}>
            {children}
          </a>
        )
      if (target.kind === 'external')
        return (
          <a {...props} href={href} target="_blank" rel="noopener noreferrer">
            {children}
          </a>
        )
      if (target.kind === 'inert') return <span title={href}>{children}</span>
      const path = fileRoutePath({ ...route, path: target.path })
      return (
        <a
          {...props}
          href={path}
          onClick={event => {
            if (!isPlainClick(event)) return
            event.preventDefault()
            navigate(path)
          }}
        >
          {children}
        </a>
      )
    },
    img: ({ alt, src }) => (
      <span className="reader-image-placeholder" title={typeof src === 'string' ? src : undefined}>
        [图片{alt ? `: ${alt}` : ''}]
      </span>
    ),
  }
  return (
    <div className="reader-markdown-page">
      <Markdown
        text={content}
        variant="reader"
        rehypePlugins={highlight}
        components={components}
        skipHtml
      />
    </div>
  )
}
