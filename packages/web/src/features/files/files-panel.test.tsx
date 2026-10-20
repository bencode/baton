import type { FileDirectory, FileSearchResult, WorkerView } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import type { FileScope } from '../../api/files'
import { ApiContext } from '../../app/api-context'
import { fileRoutePath } from '../../app/route'
import { FilesPanel } from './files-panel'

afterEach(cleanup)

const worker = (id: number, name: string, connected: boolean): WorkerView => ({
  id,
  projectId: 1,
  agentKind: 'claude-code',
  machineId: `m-${id}`,
  name,
  hostname: `h-${id}`,
  createdAt: 0,
  connected,
})

const directories: Record<string, FileDirectory> = {
  '': {
    path: '',
    entries: [
      { name: 'docs', path: 'docs', kind: 'directory' },
      { name: 'README.md', path: 'README.md', kind: 'file' },
    ],
    truncated: false,
  },
  docs: {
    path: 'docs',
    entries: [{ name: 'plan.md', path: 'docs/plan.md', kind: 'file' }],
    truncated: false,
  },
}

const setup = () => {
  const files = {
    branches: vi.fn(async () => [
      { name: 'main', worktree: '/repo', commit: 'a'.repeat(40), current: true },
      { name: 'feat/x', worktree: '/wt', commit: 'b'.repeat(40), current: false },
      { name: 'archive', worktree: null, commit: 'c'.repeat(40), current: false },
    ]),
    list: vi.fn(async (_scope: FileScope, path: string) => directories[path]),
    search: vi.fn(
      async (): Promise<FileSearchResult> => ({
        entries: Array.from({ length: 500 }, (_, index) => ({
          name: `hit-${index}.md`,
          path: `docs/hit-${index}.md`,
          kind: 'file' as const,
        })),
        truncated: true,
      }),
    ),
    view: vi.fn(),
  }
  const api = {
    workers: {
      listByProject: vi.fn(async () => [
        worker(1, 'offline-box', false),
        worker(2, 'mac-mini', true),
        worker(3, 'colima', true),
      ]),
    },
    files,
  } as unknown as Api
  const open = vi.fn()
  render(
    <ApiContext.Provider value={api}>
      <FilesPanel
        projectId={1}
        activeId="/proj/1"
        open={open}
        renderToolbar={actions => <div>{actions}</div>}
      />
    </ApiContext.Provider>,
  )
  return { files, open }
}

test('only the first online worker and its own branch load, one level at a time', async () => {
  const { files, open } = setup()
  expect(await screen.findByText('README.md')).toBeTruthy()
  expect(files.branches).toHaveBeenCalledTimes(1)
  expect(files.branches).toHaveBeenCalledWith(2, expect.anything())
  expect(files.list).toHaveBeenCalledTimes(1)
  expect(files.list).toHaveBeenCalledWith({ workerId: 2, branch: 'main' }, '', expect.anything())
  expect(screen.getByText('feat/x')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'docs' }))
  fireEvent.click(await screen.findByRole('button', { name: 'plan.md' }))
  expect(files.list).toHaveBeenLastCalledWith(
    { workerId: 2, branch: 'main' },
    'docs',
    expect.anything(),
  )
  expect(open).toHaveBeenCalledWith(
    fileRoutePath({ projectId: 1, workerId: 2, branch: 'main', path: 'docs/plan.md' }),
    'plan.md',
  )
  expect(files.view).not.toHaveBeenCalled()
})

test('an offline worker can be expanded but is never queried', async () => {
  const { files } = setup()
  await screen.findByText('README.md')
  fireEvent.click(screen.getByRole('button', { name: /offline-box/ }))
  expect(screen.getByText('执行环境离线')).toBeTruthy()
  expect(files.branches).not.toHaveBeenCalledWith(1, expect.anything())
})

test('searching a branch replaces its children with bounded path matches', async () => {
  const { files } = setup()
  await screen.findByText('README.md')
  fireEvent.click(screen.getByRole('button', { name: '在 main 中搜索' }))
  fireEvent.change(screen.getByRole('searchbox', { name: '在 main 中按路径搜索' }), {
    target: { value: ' hit ' },
  })
  expect(await screen.findByText('500+ 条，请输入更具体的关键词')).toBeTruthy()
  expect(files.search).toHaveBeenCalledWith(
    { workerId: 2, branch: 'main' },
    'hit',
    expect.anything(),
  )
  expect(screen.queryByText('README.md')).toBeNull()
  fireEvent.keyDown(screen.getByRole('searchbox'), { key: 'Escape' })
  expect(await screen.findByText('README.md')).toBeTruthy()
})

test('branches without a worktree wait in a collapsed group until opened', async () => {
  const { files } = setup()
  await screen.findByText('README.md')
  expect(screen.queryByRole('button', { name: /archive/ })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '其他本地分支 (1)' }))
  fireEvent.click(screen.getByRole('button', { name: /^archive\s*已提交/ }))
  await vi.waitFor(() =>
    expect(files.list).toHaveBeenCalledWith(
      { workerId: 2, branch: 'archive' },
      '',
      expect.anything(),
    ),
  )
})
