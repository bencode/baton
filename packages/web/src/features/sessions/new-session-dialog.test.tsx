import type { SessionView, WorkerView } from '@baton/shared'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { NewSessionDialog } from './new-session-dialog'

const worker: WorkerView = {
  id: 7,
  projectId: 1,
  name: 'mini',
  agentKind: 'codex',
  hostname: 'mini.local',
  machineId: 'machine',
  createdAt: 0,
  connected: true,
}
const offline = { ...worker, id: 8, name: 'offline', connected: false }
const session = { id: 3, projectId: 1, workerId: 7, name: 'session-3' } as SessionView
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {
    throw new Error('Not initialized')
  }
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const fixture = () => {
  const workers = {
    listByProject: vi.fn(async () => [worker, offline]),
    get: vi.fn(async () => worker),
  }
  const sessions = { create: vi.fn(async () => session) }
  const api = { workers, sessions } as unknown as Api
  const onCreated = vi.fn()
  const onManageWorkers = vi.fn()
  const onClose = vi.fn()
  const view = (projectId = 1) => (
    <ApiContext.Provider value={api}>
      <NewSessionDialog
        key={projectId}
        projectId={projectId}
        onCreated={onCreated}
        onManageWorkers={onManageWorkers}
        onClose={onClose}
      />
    </ApiContext.Provider>
  )
  return { workers, sessions, onCreated, onManageWorkers, onClose, view }
}
beforeEach(() => localStorage.clear())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const chooseWorker = async () =>
  fireEvent.click(await screen.findByRole('radio', { name: /^mini/ }))

test('worker selection is explicit and creation remembers the successful worker', async () => {
  const f = fixture()
  render(f.view())
  const create = screen.getByRole('button', { name: '创建会话' }) as HTMLButtonElement
  expect(create.disabled).toBe(true)
  await chooseWorker()
  fireEvent.click(create)
  await waitFor(() => expect(f.onCreated).toHaveBeenCalledWith(session))
  expect(f.workers.get).toHaveBeenCalledWith(7)
  expect(f.sessions.create).toHaveBeenCalledWith({ projectId: 1, workerId: 7 })
  expect(localStorage.getItem('baton.last-worker.1')).toBe('7')
})

test('offline remembered worker never silently switches to another environment', async () => {
  localStorage.setItem('baton.last-worker.1', '8')
  const f = fixture()
  render(f.view())
  const radio = (await screen.findByRole('radio', { name: /offline/ })) as HTMLInputElement
  expect(radio.disabled).toBe(true)
  expect((screen.getByRole('radio', { name: /^mini/ }) as HTMLInputElement).checked).toBe(false)
  expect((screen.getByText('创建会话') as HTMLButtonElement).disabled).toBe(true)
})

test.each([
  { connected: false },
  { projectId: 99 },
])('preflight rejection %j creates nothing and can be retried', async invalid => {
  const f = fixture()
  f.workers.get.mockResolvedValueOnce({ ...worker, ...invalid })
  render(f.view())
  await chooseWorker()
  fireEvent.click(screen.getByText('创建会话'))
  expect((await screen.findByRole('alert')).textContent).toContain('不可用')
  expect(f.sessions.create).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('创建会话'))
  await waitFor(() => expect(f.onCreated).toHaveBeenCalledWith(session))
})

test('POST failure releases the selected worker for another attempt', async () => {
  const f = fixture()
  f.sessions.create.mockRejectedValueOnce(new Error('Create failed'))
  render(f.view())
  await chooseWorker()
  fireEvent.click(screen.getByText('创建会话'))
  await screen.findByText('Create failed')
  expect((screen.getByRole('radio', { name: /^mini/ }) as HTMLInputElement).checked).toBe(true)
  fireEvent.click(screen.getByText('创建会话'))
  await waitFor(() => expect(f.onCreated).toHaveBeenCalledWith(session))
})

test('closing or changing projects during submission cannot open a stale conversation', async () => {
  const f = fixture()
  const response = deferred<SessionView>()
  f.sessions.create.mockReturnValueOnce(response.promise)
  const { rerender } = render(f.view())
  await chooseWorker()
  fireEvent.click(screen.getByText('创建会话'))
  await waitFor(() => expect(f.sessions.create).toHaveBeenCalledTimes(1))
  expect((screen.getByText('创建中…') as HTMLButtonElement).disabled).toBe(true)
  fireEvent.click(screen.getByText('创建中…'))
  expect(f.sessions.create).toHaveBeenCalledTimes(1)
  rerender(f.view(2))
  await act(async () => response.resolve(session))
  expect(f.onCreated).not.toHaveBeenCalled()
})

test('storage failure does not turn a successful creation into an error', async () => {
  const f = fixture()
  render(f.view())
  await chooseWorker()
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('blocked', 'SecurityError')
  })
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  fireEvent.click(screen.getByText('创建会话'))
  await waitFor(() => expect(f.onCreated).toHaveBeenCalledWith(session))
  expect(warning).toHaveBeenCalled()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('an online remembered worker is selected when its project opens the dialog again', async () => {
  localStorage.setItem('baton.last-worker.1', '7')
  const f = fixture()
  render(f.view())
  expect(((await screen.findByRole('radio', { name: /^mini/ })) as HTMLInputElement).checked).toBe(
    true,
  )
  expect((screen.getByText('创建会话') as HTMLButtonElement).disabled).toBe(false)
})
