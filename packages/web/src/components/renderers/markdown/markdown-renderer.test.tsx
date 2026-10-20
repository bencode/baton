import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { defaultMarkdownAppearance } from './markdown-appearance'
import { type MarkdownLink, MarkdownRenderer } from './markdown-renderer'

afterEach(cleanup)

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
const renderDoc = (appearance = defaultMarkdownAppearance) =>
  render(
    <MarkdownRenderer
      content={DOC}
      appearance={appearance}
      link={href => links[href] ?? { kind: 'inert' }}
      image={src => (src === './logo.png' ? '/files/logo.png' : null)}
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
  const surface = container.querySelector('.reader-surface') as HTMLElement
  expect(surface.getAttribute('data-reading-theme')).toBe('dark')
  expect(surface.getAttribute('data-reading-width')).toBe('full')
  expect(surface.style.getPropertyValue('--reader-font-size')).toBe('19px')
})
