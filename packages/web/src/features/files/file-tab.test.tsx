import type { FileView } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { FileApiError } from '../../api/files'
import { ApiContext } from '../../app/api-context'
import { fileRoutePath, type Route } from '../../app/route'
import { TabViewer } from '../../app/tabs/tab-viewer'
import { FileTab } from './file-tab'

afterEach(cleanup)

const route: Extract<Route, { kind: 'file' }> = {
  kind: 'file',
  projectId: 1,
  workerId: 2,
  branch: 'feat/x',
  path: 'docs/plan.txt',
}
const otherPath = '/proj/1/session/9'

const renderTabs = (view: () => Promise<FileView>, file = route) => {
  const api = { files: { view: vi.fn(view) } } as unknown as Api
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
  expect(await screen.findByText('hello')).toBeTruthy()
  expect(screen.getByText('· 工作目录')).toBeTruthy()
  expect(view).toHaveBeenCalledWith(
    { workerId: 2, branch: 'feat/x' },
    'docs/plan.txt',
    expect.anything(),
  )
  show(otherPath)
  show(fileRoutePath(route))
  expect(screen.getByText('hello')).toBeTruthy()
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
  expect(document.querySelector('pre')).toBeNull()
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

test('a Markdown file renders as a document and can switch to its source', async () => {
  const doc = { ...route, path: 'docs/guide.md' }
  renderTabs(
    async () => ({
      path: 'docs/guide.md',
      name: 'guide.md',
      size: 9,
      commit: null,
      kind: 'text',
      content: '# Guide\n',
    }),
    doc,
  )
  // The reader chunk (highlight.js included) is imported lazily on first render.
  expect(
    await screen.findByRole('heading', { name: 'Guide', level: 1 }, { timeout: 10_000 }),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '源码' }))
  expect(document.querySelector('pre')?.textContent).toBe('# Guide\n')
})

test('other text files show their source with no rendering toggle', async () => {
  renderTabs(async () => ({
    path: 'docs/plan.txt',
    name: 'plan.txt',
    size: 7,
    commit: null,
    kind: 'text',
    content: '# plain',
  }))
  expect(await screen.findByText('# plain')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '源码' })).toBeNull()
})
