import { type MouseEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Components } from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeSlug from 'rehype-slug'
import type { PluggableList } from 'unified'
import { Markdown } from '../../markdown'
import { highlightLanguages } from './highlight-languages'
import { appearanceSurfaceProps, type MarkdownAppearance } from './markdown-appearance'
import {
  headingElements,
  type MarkdownHeading,
  MarkdownOutline,
  readHeading,
} from './markdown-outline'
import styles from './markdown-renderer.module.scss'

// How one link in the document behaves, decided by the caller:
//   anchor   — '#…', jumps to that place in the document
//   external — opens in a new browser tab
//   internal — shown with `href`; a plain click calls `open`, modified clicks are the browser's
//   inert    — text only
export type MarkdownLink =
  | { kind: 'anchor' }
  | { kind: 'external' }
  | { kind: 'internal'; href: string; open(): void }
  | { kind: 'inert' }

// The outline is shown and hidden by the caller, who also learns whether the
// document has any headings to list.
export type MarkdownOutlineState = {
  open: boolean
  onOpenChange(open: boolean): void
  onAvailableChange(available: boolean): void
}

// GitHub's heading ids, so hand-written '#section' links match. The prefix keeps
// document ids from shadowing page globals, as GFM footnote ids already are.
const ID_PREFIX = 'user-content-'

const plugins: PluggableList = [
  [
    rehypeHighlight,
    {
      detect: false,
      languages: highlightLanguages,
      plainText: ['mermaid', 'text', 'txt', 'plaintext'],
    },
  ],
  [rehypeSlug, { prefix: ID_PREFIX }],
]

// Below this width the outline slides over the document instead of beside it.
const EMBEDDED_OUTLINE_MIN_WIDTH = 640

const isPlainClick = (event: MouseEvent): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey

const decodeFragment = (fragment: string): string | null => {
  try {
    return decodeURIComponent(fragment)
  } catch (error) {
    if (error instanceof URIError) return null
    throw error
  }
}

// The last heading at or above the top of the visible area.
const currentHeading = (elements: HTMLElement[], scroller: HTMLElement): string | null => {
  const threshold = scroller.getBoundingClientRect().top + 24
  return (
    elements.findLast(element => element.getBoundingClientRect().top <= threshold)?.id ??
    elements[0]?.id ??
    null
  )
}

const scrollTo = (element: HTMLElement) =>
  element.scrollIntoView({
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  })

// A Markdown document for reading, with highlighted code, math, diagrams, and an
// outline of its headings. The caller decides what each link does and which images
// may load (`image` returns a URL, or null for a placeholder). Raw HTML is dropped,
// so the document runs nothing. The document scrolls inside itself.
export const MarkdownRenderer = ({
  content,
  appearance,
  link,
  image,
  outline,
}: {
  content: string
  appearance: MarkdownAppearance
  link(href: string): MarkdownLink
  image(src: string): string | null
  outline: MarkdownOutlineState
}) => {
  const { open, onOpenChange, onAvailableChange } = outline
  const root = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const article = useRef<HTMLElement>(null)
  const elements = useRef<HTMLElement[]>([])
  // Kept on every scroll: a hidden tab is restored to it when shown again.
  const scrollTop = useRef<number | null>(null)
  const [headings, setHeadings] = useState<MarkdownHeading[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [width, setWidth] = useState(0)
  const layout = width >= EMBEDDED_OUTLINE_MIN_WIDTH ? 'embedded' : 'overlay'
  const visible = open && headings.length > 0

  // biome-ignore lint/correctness/useExhaustiveDependencies: headings are read again whenever the content renders
  useLayoutEffect(() => {
    const view = scroller.current
    if (!article.current || !view) return
    elements.current = headingElements(article.current)
    setHeadings(elements.current.map(readHeading))
    setActiveId(currentHeading(elements.current, view))
    onAvailableChange(elements.current.length > 0)
  }, [content, onAvailableChange])

  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (scroller.current && scrollTop.current !== null)
      scroller.current.scrollTop = scrollTop.current
  }, [])

  // Over the document, Escape closes the outline wherever focus is.
  useEffect(() => {
    if (!visible || layout !== 'overlay') return
    const close = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onOpenChange(false)
    }
    document.addEventListener('keydown', close, true)
    return () => document.removeEventListener('keydown', close, true)
  }, [visible, layout, onOpenChange])

  // Scrolls to the element a '#fragment' names, given as written or as GitHub prefixes it.
  const jump = (fragment: string) => {
    const id = decodeFragment(fragment)
    const target =
      id === null
        ? undefined
        : [...(article.current?.querySelectorAll<HTMLElement>('[id]') ?? [])].find(
            element => element.id === id || element.id === `${ID_PREFIX}${id}`,
          )
    if (!target) return
    scrollTo(target)
    if (elements.current.includes(target)) setActiveId(target.id)
  }

  const pick = (id: string) => {
    jump(id)
    if (layout === 'overlay') onOpenChange(false)
  }

  const components: Components = {
    a: ({ node: _node, href = '', children, ...props }) => {
      const target = link(href)
      if (target.kind === 'anchor')
        return (
          <a
            {...props}
            href={href}
            onClick={event => {
              if (!isPlainClick(event)) return
              event.preventDefault()
              jump(href.slice(1))
            }}
          >
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
        return <img className={styles.image} src={url} alt={alt ?? ''} loading="lazy" />
      return (
        <span className={styles.imagePlaceholder} title={typeof src === 'string' ? src : undefined}>
          [图片{alt ? `: ${alt}` : ''}]
        </span>
      )
    },
  }

  return (
    <div
      {...appearanceSurfaceProps(appearance)}
      ref={root}
      className={styles.renderer}
      data-outline-layout={layout}
    >
      {visible && (
        <div className={styles.outlineLayer}>
          {layout === 'overlay' && (
            <button
              type="button"
              className={styles.backdrop}
              aria-label="关闭大纲"
              onClick={() => onOpenChange(false)}
            />
          )}
          <MarkdownOutline
            headings={headings}
            activeId={activeId}
            layout={layout}
            onPick={pick}
            onClose={() => onOpenChange(false)}
          />
        </div>
      )}
      <div
        ref={scroller}
        className={styles.scroll}
        onScroll={event => {
          scrollTop.current = event.currentTarget.scrollTop
          setActiveId(currentHeading(elements.current, event.currentTarget))
        }}
      >
        <article ref={article} className={styles.page}>
          <Markdown
            text={content}
            variant="reader"
            rehypePlugins={plugins}
            components={components}
            skipHtml
          />
        </article>
      </div>
    </div>
  )
}
