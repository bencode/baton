import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, expect, test } from 'vitest'
import { createApi } from '../../api'
import { ApiContext } from '../../app/api-context'
import { fileRoutePath, type Route } from '../../app/route'
import { MarkdownReader } from './markdown-reader'

afterEach(cleanup)

const route: Extract<Route, { kind: 'file' }> = {
  kind: 'file',
  projectId: 1,
  workerId: 2,
  branch: 'feat/x',
  path: 'docs/guide.md',
}

const Location = () => <output data-testid="location">{useLocation().pathname}</output>

const DOC = [
  '# Guide',
  '',
  '```ts',
  'const answer: number = 42',
  '```',
  '',
  '[next](./next.md) [web](https://example.com) [mail](mailto:a@b.dev) [escape](../../x.md)',
  '',
  '![logo](./logo.png) ![pixel](https://tracker.example/p.png) ![out](../../../x.png)',
  '',
  '<script>alert(1)</script>',
].join('\n')

const renderDoc = () =>
  render(
    <ApiContext.Provider value={createApi()}>
      <MemoryRouter initialEntries={[fileRoutePath(route)]}>
        <MarkdownReader route={route} content={DOC} />
        <Location />
      </MemoryRouter>
    </ApiContext.Provider>,
  )

test('fenced code is highlighted by its language', () => {
  const { container } = renderDoc()
  expect(container.querySelector('code.language-ts .hljs-keyword')?.textContent).toBe('const')
})

test('relative links open the target in the same worker and branch', () => {
  renderDoc()
  fireEvent.click(screen.getByRole('link', { name: 'next' }))
  expect(screen.getByTestId('location').textContent).toBe(
    fileRoutePath({ ...route, path: 'docs/next.md' }),
  )
  expect(screen.getByRole('link', { name: 'web' }).getAttribute('target')).toBe('_blank')
  expect(screen.queryByRole('link', { name: 'mail' })).toBeNull()
  expect(screen.queryByRole('link', { name: 'escape' })).toBeNull()
})

test('relative images load from the same branch; remote and escaping ones stay placeholders', () => {
  const { container } = renderDoc()
  const images = [...container.querySelectorAll('img')]
  expect(images.map(image => image.getAttribute('src'))).toEqual([
    '/api/workers/2/raw?branch=feat%2Fx&path=docs%2Flogo.png',
  ])
  expect(screen.getByText('[图片: pixel]')).toBeTruthy()
  expect(screen.getByText('[图片: out]')).toBeTruthy()
  expect(container.querySelector('script')).toBeNull()
  expect(container.textContent).not.toContain('alert(1)')
})
