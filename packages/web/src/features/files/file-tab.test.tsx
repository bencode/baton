import type { FileView } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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
  path: 'docs/plan.md',
}
const filePath = fileRoutePath(route)
const otherPath = '/proj/1/session/9'

const renderTabs = (view: () => Promise<FileView>) => {
  const api = { files: { view: vi.fn(view) } } as unknown as Api
  const tabs = [
    { id: filePath, title: 'plan.md', lastActiveAt: 0 },
    { id: otherPath, title: 'chat', lastActiveAt: 0 },
  ]
  const ui = (activeId: string) => (
    <ApiContext.Provider value={api}>
      <TabViewer
        tabs={tabs}
        activeId={activeId}
        renderTab={tab => (tab.id === filePath ? <FileTab route={route} /> : <p>chat</p>)}
        empty={null}
      />
    </ApiContext.Provider>
  )
  const rendered = render(ui(filePath))
  return { view: api.files.view, show: (activeId: string) => rendered.rerender(ui(activeId)) }
}

test('a file loads once per activation and again only on refresh', async () => {
  const { view, show } = renderTabs(async () => ({
    path: 'docs/plan.md',
    name: 'plan.md',
    size: 5,
    kind: 'text',
    content: 'hello',
  }))
  expect(await screen.findByText('hello')).toBeTruthy()
  expect(view).toHaveBeenCalledWith(
    { workerId: 2, branch: 'feat/x' },
    'docs/plan.md',
    expect.anything(),
  )
  show(otherPath)
  show(filePath)
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
  renderTabs(async () => ({ path: 'docs/plan.md', name: 'plan.md', ...shape }) as FileView)
  expect(await screen.findByText(notice)).toBeTruthy()
  expect(document.querySelector('pre')).toBeNull()
})

test('a branch without a worktree is reported, not resolved elsewhere', async () => {
  const { view } = renderTabs(async () => {
    throw new FileApiError('missing', 404, 'branch_not_found')
  })
  expect(await screen.findByText('该分支没有检出的工作目录（worktree 可能已被删除）')).toBeTruthy()
  expect(view).toHaveBeenCalledTimes(1)
})
