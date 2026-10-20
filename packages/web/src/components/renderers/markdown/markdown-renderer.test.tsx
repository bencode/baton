import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { defaultMarkdownAppearance } from './markdown-appearance'
import { type MarkdownLink, MarkdownRenderer } from './markdown-renderer'

const scrolled = vi.fn()
beforeEach(() => {
  scrolled.mockClear()
  // jsdom does not scroll; record which element was asked to.
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled(this.id || this.textContent)
  }
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const DOC = [
  '# Guide',
  '',
  '```ts',
  'const answer: number = 42',
  '```',
  '',
  '[top](#guide) [web](https://example.com) [next](./next.md) [mail](mailto:a@b.dev)',
  '',
  '![logo](./logo.png) ![pixel](https://tracker.example/p.png)',
  '',
  '<script>alert(1)</script>',
].join('\n')

const open = vi.fn()
const links: Record<string, MarkdownLink> = {
  '#guide': { kind: 'anchor' },
  'https://example.com': { kind: 'external' },
  './next.md': { kind: 'internal', href: '/docs/next', open },
}
const closedOutline = { open: false, onOpenChange: () => {}, onAvailableChange: () => {} }
const renderDoc = (
  appearance = defaultMarkdownAppearance,
  content = DOC,
  outline = closedOutline,
) =>
  render(
    <MarkdownRenderer
      content={content}
      appearance={appearance}
      link={href => links[href] ?? (href.startsWith('#') ? { kind: 'anchor' } : { kind: 'inert' })}
      image={src => (src === './logo.png' ? '/files/logo.png' : null)}
      outline={outline}
    />,
  )

test('fenced code is highlighted by its language', () => {
  const { container } = renderDoc()
  expect(container.querySelector('code.language-ts .hljs-keyword')?.textContent).toBe('const')
})

test('each link renders as the caller decides', () => {
  renderDoc()
  expect(screen.getByRole('link', { name: 'top' }).getAttribute('href')).toBe('#guide')
  expect(screen.getByRole('link', { name: 'web' }).getAttribute('target')).toBe('_blank')
  expect(screen.queryByRole('link', { name: 'mail' })).toBeNull()
  const next = screen.getByRole('link', { name: 'next' })
  expect(next.getAttribute('href')).toBe('/docs/next')
  fireEvent.click(next, { metaKey: true })
  expect(open).not.toHaveBeenCalled()
  fireEvent.click(next)
  expect(open).toHaveBeenCalledOnce()
})

test('only images the caller resolves load; raw HTML never reaches the page', () => {
  const { container } = renderDoc()
  expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual([
    '/files/logo.png',
  ])
  expect(screen.getByText('[图片: pixel]')).toBeTruthy()
  expect(container.querySelector('script')).toBeNull()
  expect(container.textContent).not.toContain('alert(1)')
})

test('the appearance styles the document surface', () => {
  const { container } = renderDoc({ fontSize: 19, width: 'full', theme: 'dark' })
  const surface = container.querySelector('[data-reading-theme]') as HTMLElement
  expect(surface.getAttribute('data-reading-theme')).toBe('dark')
  expect(surface.getAttribute('data-reading-width')).toBe('full')
  expect(surface.style.getPropertyValue('--reader-font-size')).toBe('19px')
})

const OUTLINED = [
  '# Guide',
  '## 安装',
  'Go to [setup](#安装) or [nowhere](#missing).',
  '### Step $x^2$',
  '## ![logo](./logo.png) Images',
  '## 安装',
].join('\n\n')

// jsdom has no layout, so the renderer measures 0px and lays the outline over the
// document unless a width is given.
const atWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width)

const outlined = (open = true) => {
  const outline = { open, onOpenChange: vi.fn(), onAvailableChange: vi.fn() }
  const view = renderDoc(defaultMarkdownAppearance, OUTLINED, outline)
  return { ...view, outline }
}

test('headings get GitHub ids and an outline in document order', () => {
  atWidth(1000)
  const { container, outline } = outlined()
  const ids = [...container.querySelectorAll('article :is(h1, h2, h3)')].map(h => h.id)
  expect([ids[0], ids[1], ids[4]]).toEqual([
    'user-content-guide',
    'user-content-安装',
    'user-content-安装-1',
  ])
  expect(outline.onAvailableChange).toHaveBeenLastCalledWith(true)
  const items = screen.getAllByRole('button', { name: /./ }).filter(b => b.closest('nav'))
  expect(items.map(item => [item.textContent, item.style.paddingInlineStart])).toEqual([
    ['Guide', '10px'],
    ['安装', '24px'],
    ['Step x^2', '38px'],
    ['logo Images', '24px'],
    ['安装', '24px'],
  ])
})

test('a document without headings has no outline to offer', () => {
  const outline = { open: true, onOpenChange: vi.fn(), onAvailableChange: vi.fn() }
  renderDoc(defaultMarkdownAppearance, 'Just text.', outline)
  expect(outline.onAvailableChange).toHaveBeenLastCalledWith(false)
  expect(screen.queryByRole('navigation', { name: '大纲' })).toBeNull()
})

test('the outline and in-document links jump to their heading', () => {
  atWidth(1000)
  const { outline } = outlined()
  fireEvent.click(screen.getAllByRole('button', { name: '安装' })[1] as HTMLElement)
  expect(scrolled).toHaveBeenCalledWith('user-content-安装-1')
  fireEvent.click(screen.getByRole('link', { name: 'setup' }))
  expect(scrolled).toHaveBeenCalledWith('user-content-安装')
  scrolled.mockClear()
  fireEvent.click(screen.getByRole('link', { name: 'nowhere' }))
  expect(scrolled).not.toHaveBeenCalled()
  // Beside the document the outline stays open.
  expect(outline.onOpenChange).not.toHaveBeenCalled()
})

test('beside the document, Escape closes the outline only from inside it', () => {
  atWidth(1000)
  const { outline } = outlined()
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(outline.onOpenChange).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('navigation', { name: '大纲' }), { key: 'Escape' })
  expect(outline.onOpenChange).toHaveBeenCalledWith(false)
})

test('over a narrow document, picking a heading or Escape closes the outline', () => {
  atWidth(390)
  const { outline } = outlined()
  fireEvent.click(screen.getByRole('button', { name: 'Guide' }))
  expect(scrolled).toHaveBeenCalledWith('user-content-guide')
  expect(outline.onOpenChange).toHaveBeenLastCalledWith(false)
  outline.onOpenChange.mockClear()
  fireEvent.keyDown(document.body, { key: 'Escape' })
  expect(outline.onOpenChange).toHaveBeenCalledWith(false)
  fireEvent.click(screen.getByRole('button', { name: '关闭大纲' }))
  expect(outline.onOpenChange).toHaveBeenCalledTimes(2)
})
