import type { FileView } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, expect, test, vi } from 'vitest'
import { type Api, createApi } from '../../api'
import { FileApiError } from '../../api/files'
import { ApiContext } from '../../app/api-context'
import { fileRoutePath, type Route } from '../../app/route'
import { TabViewer } from '../../app/tabs/tab-viewer'
import { FileTab } from './file-tab'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

// jsdom lays nothing out; CodeMirror still measures text ranges when it gets the chance.
beforeAll(() => {
  Range.prototype.getClientRects ??= () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect ??= () => new DOMRect()
})

const route: Extract<Route, { kind: 'file' }> = {
  kind: 'file',
  projectId: 1,
  workerId: 2,
  branch: 'feat/x',
  path: 'docs/plan.txt',
}
const otherPath = '/proj/1/session/9'

const renderTabs = (view: () => Promise<FileView>, file = route) => {
  const api = { files: { view: vi.fn(view), rawUrl: createApi().files.rawUrl } } as unknown as Api
  const filePath = fileRoutePath(file)
  const tabs = [
    { id: filePath, title: 'plan', lastActiveAt: 0 },
    { id: otherPath, title: 'chat', lastActiveAt: 0 },
  ]
  const ui = (activeId: string) => (
    <ApiContext.Provider value={api}>
      <MemoryRouter>
        <TabViewer
          tabs={tabs}
          activeId={activeId}
          renderTab={tab => (tab.id === filePath ? <FileTab route={file} /> : <p>chat</p>)}
          empty={null}
        />
      </MemoryRouter>
    </ApiContext.Provider>
  )
  const rendered = render(ui(filePath))
  return { view: api.files.view, show: (activeId: string) => rendered.rerender(ui(activeId)) }
}

test('a file loads once per activation and again only on refresh', async () => {
  const { view, show } = renderTabs(async () => ({
    path: 'docs/plan.txt',
    name: 'plan.txt',
    size: 5,
    commit: null,
    kind: 'text',
    content: 'hello',
  }))
  // The source reader (CodeMirror) is imported lazily on first render.
  expect(await screen.findByText('hello', {}, { timeout: 10_000 })).toBeTruthy()
  expect(screen.getByText('· 工作目录')).toBeTruthy()
  expect(view).toHaveBeenCalledWith(
    { workerId: 2, branch: 'feat/x' },
    'docs/plan.txt',
    expect.anything(),
  )
  show(otherPath)
  show(fileRoutePath(route))
  // Showing the tab again rebuilds the editor from the loaded content, without a new read.
  await vi.waitFor(() => expect(document.querySelector('.cm-content')?.textContent).toBe('hello'))
  expect(view).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '刷新文件' }))
  await vi.waitFor(() => expect(view).toHaveBeenCalledTimes(2))
})

test.each([
  [{ kind: 'binary', size: 2048 }, '二进制文件（2.0 KiB），不提供预览。'],
  [
    { kind: 'too_large', size: 6 * 1024 * 1024, limit: 5 * 1024 * 1024 },
    '文件大小 6.0 MiB，超过 5.0 MiB 上限，不提供预览。',
  ],
] as const)('%o shows a notice instead of content', async (shape, notice) => {
  renderTabs(
    async () => ({ path: 'docs/plan.txt', name: 'plan.txt', commit: null, ...shape }) as FileView,
  )
  expect(await screen.findByText(notice)).toBeTruthy()
  expect(document.querySelector('.cm-editor')).toBeNull()
})

test('content read from a commit names that commit', async () => {
  renderTabs(async () => ({
    path: 'docs/plan.txt',
    name: 'plan.txt',
    size: 5,
    commit: '89ada05297d6cf638eeb704cc3bcd21a7b62fe58',
    kind: 'text',
    content: 'hello',
  }))
  expect(await screen.findByText('· 提交 89ada05')).toBeTruthy()
})

test('a missing branch is reported, not resolved elsewhere', async () => {
  const { view } = renderTabs(async () => {
    throw new FileApiError('missing', 404, 'branch_not_found')
  })
  expect(await screen.findByText('分支不存在')).toBeTruthy()
  expect(view).toHaveBeenCalledTimes(1)
})

test('other text files open in the code view with search and wrapping, not the reading appearance', async () => {
  renderTabs(async () => ({
    path: 'docs/plan.txt',
    name: 'plan.txt',
    size: 7,
    commit: null,
    kind: 'text',
    content: '# plain',
  }))
  await vi.waitFor(
    () => expect(document.querySelector('.cm-content')?.textContent).toBe('# plain'),
    {
      timeout: 10_000,
    },
  )
  expect(screen.queryByRole('button', { name: '源码' })).toBeNull()
  expect(screen.queryByRole('button', { name: '阅读外观' })).toBeNull()
  expect(screen.getByRole('button', { name: '在文件中搜索' })).toBeTruthy()
  const wrap = screen.getByRole('button', { name: '自动换行' })
  expect(wrap.getAttribute('aria-pressed')).toBe('false')
  fireEvent.click(wrap)
  expect(wrap.getAttribute('aria-pressed')).toBe('true')
  await vi.waitFor(() =>
    expect(document.querySelector('.cm-content')?.classList.contains('cm-lineWrapping')).toBe(true),
  )
  fireEvent.click(wrap)
})

const image = async (): Promise<FileView> => ({
  path: 'img/arch.png',
  name: 'arch.png',
  size: 68,
  commit: null,
  kind: 'image',
  mediaType: 'image/png',
})

test('an image file shows its bytes from the raw endpoint, fitted until switched', async () => {
  renderTabs(image, { ...route, path: 'img/arch.png' })
  const shown = await screen.findByRole('img', { name: 'arch.png' })
  expect(shown.getAttribute('src')).toBe('/api/workers/2/raw?branch=feat%2Fx&path=img%2Farch.png')
  expect(shown.className).toBe('image-renderer-fit')
  fireEvent.click(screen.getByRole('button', { name: '原始大小' }))
  expect(screen.getByRole('img', { name: 'arch.png' }).className).toBe('image-renderer-actual')
  fireEvent.click(screen.getByRole('button', { name: '刷新文件' }))
  await vi.waitFor(() =>
    expect(screen.getByRole('img', { name: 'arch.png' }).getAttribute('src')).toContain('&r=1'),
  )
})

test('phones keep images fitted and leave zooming to the system', async () => {
  const matchMedia = window.matchMedia
  vi.stubGlobal('matchMedia', (query: string) => ({
    ...matchMedia(query),
    matches: query === '(max-width: 767px)',
  }))
  renderTabs(image, { ...route, path: 'img/arch.png' })
  expect((await screen.findByRole('img', { name: 'arch.png' })).className).toBe(
    'image-renderer-fit',
  )
  expect(screen.queryByRole('button', { name: '原始大小' })).toBeNull()
})
