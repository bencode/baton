import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { type Api, createApi } from '../../api'
import { ApiContext } from '../../app/api-context'
import { fileRoutePath, type Route } from '../../app/route'
import { FileTab } from './file-tab'
import { parseReadingPreferences } from './reading-preferences'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// jsdom lays nothing out: CodeMirror still measures text ranges when it gets the
// chance, and the outline keeps its current heading scrolled into view.
beforeAll(() => {
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
  Element.prototype.scrollIntoView ??= () => {}
})

const route: Extract<Route, { kind: 'file' }> = {
  kind: 'file',
  projectId: 1,
  workerId: 2,
  branch: 'feat/x',
  path: 'docs/guide.md',
}

const DOC = [
  '# Guide',
  '',
  '[next](./next.md) [escape](../../x.md)',
  '',
  '![logo](./logo.png) ![pixel](https://tracker.example/p.png) ![out](../../../x.png)',
].join('\n')

const Location = () => <output data-testid="location">{useLocation().pathname}</output>

const renderGuide = (content = DOC) => {
  const api = {
    files: {
      view: async () => ({
        path: route.path,
        name: 'guide.md',
        size: content.length,
        commit: null,
        kind: 'text',
        content,
      }),
      rawUrl: createApi().files.rawUrl,
    },
  } as unknown as Api
  return render(
    <ApiContext.Provider value={api}>
      <MemoryRouter initialEntries={[fileRoutePath(route)]}>
        <FileTab route={route} />
        <Location />
      </MemoryRouter>
    </ApiContext.Provider>,
  )
}

// The renderer chunk (highlight.js included) is imported lazily on first render.
const documentShown = () =>
  screen.findByRole('heading', { name: 'Guide', level: 1 }, { timeout: 10_000 })

const usePhoneViewport = () => {
  const matchMedia = window.matchMedia
  vi.stubGlobal('matchMedia', (query: string) => ({
    ...matchMedia(query),
    matches: query === '(max-width: 767px)',
  }))
}

test('relative links and images stay in the same worker and branch', async () => {
  const { container } = renderGuide()
  await documentShown()
  expect([...container.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual([
    '/api/workers/2/raw/feat:x/docs/logo.png',
  ])
  expect(screen.getByText('[图片: pixel]')).toBeTruthy()
  expect(screen.getByText('[图片: out]')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'escape' })).toBeNull()
  fireEvent.click(screen.getByRole('link', { name: 'next' }))
  expect(screen.getByTestId('location').textContent).toBe(
    fileRoutePath({ ...route, path: 'docs/next.md' }),
  )
})

test('the source view trades the reading appearance for search and wrapping', async () => {
  renderGuide()
  await documentShown()
  expect(screen.getByRole('button', { name: '阅读外观' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '源码' }))
  await vi.waitFor(
    () => expect(document.querySelector('.cm-content')?.textContent).toContain('# Guide'),
    { timeout: 10_000 },
  )
  expect(screen.queryByRole('button', { name: '阅读外观' })).toBeNull()
  expect(screen.getByRole('button', { name: '在文件中搜索' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '自动换行' })).toBeTruthy()
})

test('phones always show the document', async () => {
  usePhoneViewport()
  renderGuide()
  await documentShown()
  expect(screen.queryByRole('button', { name: '源码' })).toBeNull()
  expect(screen.getByRole('button', { name: '阅读外观' })).toBeTruthy()
})

test('a chosen appearance restyles the document and is remembered', async () => {
  const { container } = renderGuide()
  await documentShown()
  fireEvent.click(screen.getByRole('button', { name: '阅读外观' }))
  fireEvent.click(screen.getByRole('button', { name: /深色/ }))
  expect(container.querySelector('[data-reading-theme]')?.getAttribute('data-reading-theme')).toBe(
    'dark',
  )
  expect(parseReadingPreferences(localStorage.getItem('baton.reader.preferences')).theme).toBe(
    'dark',
  )
})

test('the outline is offered for documents with headings, in the rendered view', async () => {
  renderGuide()
  await documentShown()
  const toggle = await screen.findByRole('button', { name: '大纲' })
  expect(toggle.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(toggle)
  expect(screen.getByRole('navigation', { name: '大纲' }).textContent).toBe('Guide')
  fireEvent.click(screen.getByRole('button', { name: '源码' }))
  expect(screen.queryByRole('button', { name: '大纲' })).toBeNull()
})

test('a document without headings offers no outline', async () => {
  renderGuide('Just text.')
  expect(await screen.findByText('Just text.', {}, { timeout: 10_000 })).toBeTruthy()
  expect(screen.queryByRole('button', { name: '大纲' })).toBeNull()
})
