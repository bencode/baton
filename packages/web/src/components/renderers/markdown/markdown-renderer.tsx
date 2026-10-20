import type { MouseEvent } from 'react'
import type { Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import type { PluggableList } from 'unified'
import { Markdown } from '../../markdown'
import { highlightLanguages } from './highlight-languages'
import { appearanceSurfaceProps, type MarkdownAppearance } from './markdown-appearance'

// How one link in the document behaves, decided by the caller:
//   anchor   — '#…', stays on the page
//   external — opens in a new browser tab
//   internal — shown with `href`; a plain click calls `open`, modified clicks are the browser's
//   inert    — text only
export type MarkdownLink =
  | { kind: 'anchor' }
  | { kind: 'external' }
  | { kind: 'internal'; href: string; open(): void }
  | { kind: 'inert' }

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

// A Markdown document for reading, with highlighted code, math, and diagrams. The
// caller decides what each link does and which images may load (`image` returns a
// URL, or null for a placeholder). Raw HTML is dropped, so the document runs nothing.
export const MarkdownRenderer = ({
  content,
  appearance,
  link,
  image,
}: {
  content: string
  appearance: MarkdownAppearance
  link(href: string): MarkdownLink
  image(src: string): string | null
}) => {
  const components: Components = {
    a: ({ node: _node, href = '', children, ...props }) => {
      const target = link(href)
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
      return (
        <a
          {...props}
          href={target.href}
          onClick={event => {
            if (!isPlainClick(event)) return
            event.preventDefault()
            target.open()
          }}
        >
          {children}
        </a>
      )
    },
    img: ({ alt, src }) => {
      const url = typeof src === 'string' ? image(src) : null
      if (url !== null)
        return <img className="reader-image" src={url} alt={alt ?? ''} loading="lazy" />
      return (
        <span
          className="reader-image-placeholder"
          title={typeof src === 'string' ? src : undefined}
        >
          [图片{alt ? `: ${alt}` : ''}]
        </span>
      )
    },
  }
  return (
    <div {...appearanceSurfaceProps(appearance)}>
      <div className="reader-markdown-page">
        <Markdown
          text={content}
          variant="reader"
          rehypePlugins={highlight}
          components={components}
          skipHtml
        />
      </div>
    </div>
  )
}
