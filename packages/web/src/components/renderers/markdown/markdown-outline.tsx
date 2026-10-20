import { type KeyboardEvent, useEffect, useRef } from 'react'
import styles from './markdown-outline.module.scss'

export type MarkdownHeading = { id: string; title: string; level: number }

const HEADINGS = 'h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]'

// Heading text as a reader sees it: math as its TeX source (KaTeX renders it
// twice, once for screen readers), images by their alt text.
const textOf = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
  if (!(node instanceof Element)) return ''
  if (node.classList.contains('katex'))
    return node.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? ''
  if (node.tagName === 'IMG') return node.getAttribute('alt') ?? ''
  if (node.tagName === 'BR') return ' '
  return [...node.childNodes].map(textOf).join('')
}

export const headingElements = (root: ParentNode): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(HEADINGS),
]

export const readHeading = (element: HTMLElement): MarkdownHeading => ({
  id: element.id,
  title: textOf(element).replace(/\s+/gu, ' ').trim() || '无标题',
  level: Number(element.tagName.slice(1)),
})

// The document's headings, indented from the shallowest level present. Focus
// moves to the current heading when the outline opens; Escape inside it closes it.
export const MarkdownOutline = ({
  headings,
  activeId,
  layout,
  onPick,
  onClose,
}: {
  headings: MarkdownHeading[]
  activeId: string | null
  layout: 'embedded' | 'overlay'
  onPick(id: string): void
  onClose(): void
}) => {
  const first = useRef<HTMLButtonElement>(null)
  const active = useRef<HTMLButtonElement>(null)
  const minLevel = Math.min(...headings.map(heading => heading.level))

  useEffect(() => {
    ;(active.current ?? first.current)?.focus()
  }, [])
  useEffect(() => {
    if (activeId) active.current?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  const closeOnEscape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <nav
      className={styles.outline}
      data-layout={layout}
      aria-label="大纲"
      onKeyDown={closeOnEscape}
    >
      <ul>
        {headings.map((heading, index) => {
          const current = heading.id === activeId
          return (
            <li key={heading.id}>
              <button
                ref={current ? active : index === 0 ? first : undefined}
                type="button"
                className={styles.item}
                aria-current={current ? 'location' : undefined}
                title={heading.title}
                style={{ paddingInlineStart: 10 + (heading.level - minLevel) * 14 }}
                onClick={() => onPick(heading.id)}
              >
                {heading.title}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
