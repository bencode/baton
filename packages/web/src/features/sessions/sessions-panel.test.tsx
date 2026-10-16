import type { SessionView, WorkerView } from '@baton/shared'
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { useWorkers } from '../workers/use-workers'
import { SessionsPanel } from './sessions-panel'
import { useSessions } from './use-sessions'

const workers: WorkerView[] = [1, 2].map(id => ({
  id,
  projectId: 1,
  name: `worker-${id}`,
  hostname: 'mini',
  agentKind: 'codex',
  connected: true,
  machineId: 'mini',
  createdAt: 0,
}))
const sessions: SessionView[] = workers.map(worker => ({
  id: worker.id,
  workerId: worker.id,
  worker,
  projectId: 1,
  name: worker.id === 1 ? 'Login' : 'Deployment',
  agentKind: 'codex',
  connected: true,
  attached: false,
  busy: false,
  lastActiveAt: Date.now(),
  activeLoops: 0,
  mode: 'worker',
  agentSessionId: null,
  cwd: null,
  shareToken: null,
  createdAt: 0,
  updatedAt: 0,
  planMode: false,
  model: null,
  effort: null,
  terminalOpen: false,
}))
const fixture = () => {
  const api = {
    sessions: { listByProject: vi.fn(async () => sessions), remove: vi.fn(async () => undefined) },
    workers: { listByProject: vi.fn(async () => workers) },
  }
  const close = vi.fn()
  const open = vi.fn()
  render(
    <ApiContext.Provider value={api as unknown as Api}>
      <SessionsPanel
        onNewSession={vi.fn()}
        renderToolbar={actions => actions}
        projectId={1}
        activeId="/proj/1"
        close={close}
        open={open}
      />
    </ApiContext.Provider>,
  )
  return { api, close, open }
}
afterEach(cleanup)

test('sessions are independent of the worker hierarchy and searchable by name and worker', async () => {
  const f = fixture()
  fireEvent.click(await screen.findByText('Login'))
  expect(f.open).toHaveBeenCalledWith('/proj/1/session/1', 'Login')
  fireEvent.click(screen.getByRole('button', { name: '搜索会话' }))
  fireEvent.change(screen.getByLabelText('搜索当前项目的会话'), { target: { value: 'login' } })
  expect(screen.queryByText('Deployment')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '按执行环境筛选' }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'worker-2' }))
  expect(screen.getByText(/没有匹配的会话/)).toBeTruthy()
})

test('failed deletion remains visible and retry closes only the removed session', async () => {
  const f = fixture()
  f.api.sessions.remove.mockRejectedValueOnce(new Error('Cannot delete'))
  await screen.findByText('Login')
  fireEvent.click(screen.getAllByLabelText('删除会话')[0] as HTMLElement)
  fireEvent.click(screen.getByLabelText('确认删除'))
  await screen.findByText('Cannot delete')
  expect(f.close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByLabelText('确认删除'))
  await waitFor(() => expect(f.close).toHaveBeenCalledWith('/proj/1/session/2'))
  expect(screen.queryByText('Deployment')).toBeNull()
  expect(screen.getByText('Login')).toBeTruthy()
})

test('initial load failure is an error, and retry restores the list', async () => {
  const listByProject = vi
    .fn(async () => sessions)
    .mockRejectedValueOnce(new Error('Network failed'))
  const api = {
    sessions: { listByProject },
    workers: { listByProject: vi.fn(async () => workers) },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <SessionsPanel
        onNewSession={vi.fn()}
        renderToolbar={actions => actions}
        projectId={1}
        activeId="/proj/1"
        open={vi.fn()}
        close={vi.fn()}
      />
    </ApiContext.Provider>,
  )
  expect((await screen.findByRole('alert')).textContent).toContain('无法加载会话')
  expect(screen.queryByText(/暂无会话/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  await screen.findByText('Login')
  expect(screen.queryByRole('alert')).toBeNull()
})

test('late requests from an old project cannot overwrite current session or worker data', async () => {
  let finishSessions: (value: SessionView[]) => void = () => {
    throw new Error('Not initialized')
  }
  let finishWorkers: (value: WorkerView[]) => void = () => {
    throw new Error('Not initialized')
  }
  const oldSessions = new Promise<SessionView[]>(resolve => {
    finishSessions = resolve
  })
  const oldWorkers = new Promise<WorkerView[]>(resolve => {
    finishWorkers = resolve
  })
  const api = {
    sessions: {
      listByProject: vi.fn((id: number) => (id === 1 ? oldSessions : Promise.resolve([]))),
    },
    workers: {
      listByProject: vi.fn((id: number) => (id === 1 ? oldWorkers : Promise.resolve([]))),
    },
  } as unknown as Api
  const { result, rerender } = renderHook(
    ({ projectId }) => ({ sessions: useSessions(projectId), workers: useWorkers(projectId) }),
    {
      initialProps: { projectId: 1 },
      wrapper: ({ children }) => <ApiContext.Provider value={api}>{children}</ApiContext.Provider>,
    },
  )
  rerender({ projectId: 2 })
  await waitFor(() => expect(result.current.sessions.data).toEqual([]))
  await act(async () => {
    finishSessions(sessions)
    finishWorkers(workers)
  })
  expect(result.current.sessions.data).toEqual([])
  expect(result.current.workers.data).toEqual([])
})

test('closing search clears the query and clearing the worker chip restores the list', async () => {
  fixture()
  await screen.findByText('Login')
  fireEvent.click(screen.getByRole('button', { name: '搜索会话' }))
  fireEvent.change(screen.getByLabelText('搜索当前项目的会话'), { target: { value: 'login' } })
  expect(screen.queryByText('Deployment')).toBeNull()
  fireEvent.keyDown(screen.getByLabelText('搜索当前项目的会话'), { key: 'Escape' })
  expect(screen.queryByLabelText('搜索当前项目的会话')).toBeNull()
  expect(screen.getByText('Deployment')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '搜索会话' }))
  fireEvent.click(screen.getByRole('button', { name: '按执行环境筛选' }))
  fireEvent.click(screen.getByRole('menuitemradio', { name: 'worker-1' }))
  expect(screen.queryByText('Deployment')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '清除执行环境筛选' }))
  expect(screen.getByText('Deployment')).toBeTruthy()
})
