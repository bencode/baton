import type { SessionView, WorkerCreation, WorkerView } from '@baton/shared'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { type Api, ApiError } from '../../api'
import { ApiContext } from '../../app/api-context'
import { WorkersPanel } from './workers-panel'

const creation: WorkerCreation = {
  id: 1,
  projectId: 42,
  machineId: 'mini',
  templateId: 'mini-local',
  name: 'app',
  agentKind: 'codex',
  status: 'pending',
  step: null,
  error: null,
  repoPath: null,
  workerId: null,
  createdAt: 0,
  updatedAt: 0,
  finishedAt: null,
}
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise not initialized')
  }
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const fixture = (records: WorkerCreation[] = []) => {
  const workerCreations = {
    templates: vi.fn(async () => [
      {
        id: 'mini-local',
        name: 'Mini local',
        agentKinds: ['claude-code', 'codex'],
        available: true,
      },
    ]),
    listByProject: vi.fn(async () => records),
    create: vi.fn(async () => creation),
  }
  const workers = {
    get: vi.fn(async () => ({ id: 8, projectId: 42, connected: true }) as WorkerView),
  }
  const sessions = { create: vi.fn(async () => ({ id: 9, name: 'chat' }) as SessionView) }
  const api = {
    workerCreations,
    workers,
    sessions,
    auth: { me: vi.fn(async () => ({ hasToken: false })) },
  } as unknown as Api
  const open = vi.fn()
  const tree = (projectId: number, loading = false) => (
    <ApiContext.Provider value={api}>
      <WorkersPanel
        key={projectId}
        projectId={projectId}
        workers={loading ? null : []}
        sessions={loading ? null : []}
        activeId=""
        open={open}
        close={vi.fn()}
      />
    </ApiContext.Provider>
  )
  return { workerCreations, workers, sessions, open, tree }
}
const submit = async () => {
  fireEvent.click(screen.getByRole('button', { name: '＋ Add worker' }))
  await screen.findByRole('option', { name: 'Mini local' })
  fireEvent.change(screen.getByLabelText('Worker name'), { target: { value: 'app' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create worker' }))
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('Add worker remains available before worker, session, and creation data has loaded', () => {
  const f = fixture()
  f.workerCreations.listByProject.mockReturnValue(new Promise(() => undefined))
  render(f.tree(42, true))
  fireEvent.click(screen.getByRole('button', { name: '＋ Add worker' }))
  expect(screen.getByText('Add a worker')).toBeTruthy()
})

test('closing before acceptance keeps the dialog closed, prevents repeat submission, and allows reopening from the sidebar', async () => {
  const f = fixture()
  const response = deferred<WorkerCreation>()
  f.workerCreations.create.mockReturnValueOnce(response.promise)
  render(f.tree(42))
  await submit()
  const submitting = screen.getByRole('button', { name: 'Submitting…' }) as HTMLButtonElement
  expect(submitting.disabled).toBe(true)
  fireEvent.click(submitting)
  expect(f.workerCreations.create).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByLabelText('close'))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: '＋ Add worker' }))
  f.workerCreations.listByProject.mockResolvedValue([creation])
  await act(async () => response.resolve(creation))
  expect(screen.queryByText('Worker creation')).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'app: Waiting for mini' }))
  expect(screen.getByText('Worker creation')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByText('Worker creation')).toBeNull()
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'app: Waiting for mini' }))
})

test('sidebar shows all active creations and only the most recently finished result', async () => {
  const f = fixture([
    { ...creation, id: 5, name: 'active-two', status: 'running', step: 'git' },
    { ...creation, id: 2, name: 'active-one' },
    { ...creation, id: 6, name: 'old-success', status: 'succeeded', finishedAt: 100 },
    { ...creation, id: 7, name: 'older-tie', status: 'succeeded', finishedAt: 200 },
    { ...creation, id: 8, name: 'latest-failure', status: 'failed', finishedAt: 200 },
  ])
  render(f.tree(42))
  await screen.findByRole('button', { name: 'latest-failure: Creation failed' })
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual([
    'active-oneWaiting for mini',
    'active-twoInitialize Git repository',
    'latest-failureCreation failed',
    '＋ Add worker',
  ])
  expect(screen.queryByText('old-success')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'latest-failure: Creation failed' }))
  expect(screen.getByRole('alert').textContent).toContain('Resources are retained')
})

test.each([
  409, 503,
])('HTTP %s releases the form and leaves the next operation possible', async status => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const f = fixture()
  f.workerCreations.create.mockRejectedValueOnce(new ApiError('failed', status))
  render(f.tree(42))
  await submit()
  await screen.findByRole('alert')
  expect((screen.getByLabelText('Worker name') as HTMLInputElement).value).toBe('app')
  expect(
    (screen.getByRole('button', { name: 'Create worker' }) as HTMLButtonElement).disabled,
  ).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Register existing' }))
  expect(screen.getByText('baton worker run')).toBeTruthy()
})

test('start checks current connection again; offline workers never create a session', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const f = fixture([{ ...creation, status: 'succeeded', finishedAt: 1, workerId: 8 }])
  render(f.tree(42))
  fireEvent.click(await screen.findByRole('button', { name: 'app: Created' }))
  await screen.findByText(/Worker is connected/)
  f.workers.get.mockResolvedValueOnce({ id: 8, projectId: 42, connected: false } as WorkerView)
  fireEvent.click(screen.getByRole('button', { name: 'Start conversation' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Wait for it to reconnect')
  expect(f.sessions.create).not.toHaveBeenCalled()
  expect(
    (screen.getByRole('button', { name: 'Start conversation' }) as HTMLButtonElement).disabled,
  ).toBe(false)
})

test('session errors remain visible and a subsequent start can succeed', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const f = fixture([{ ...creation, status: 'succeeded', finishedAt: 1, workerId: 8 }])
  f.sessions.create.mockRejectedValueOnce(new Error('Session creation failed'))
  render(f.tree(42))
  fireEvent.click(await screen.findByRole('button', { name: 'app: Created' }))
  await screen.findByText(/Worker is connected/)
  fireEvent.click(screen.getByRole('button', { name: 'Start conversation' }))
  expect((await screen.findByRole('alert')).textContent).toBe('Session creation failed')
  fireEvent.click(screen.getByRole('button', { name: 'Start conversation' }))
  await vi.waitFor(() => expect(f.open).toHaveBeenCalledWith('/proj/42/session/9', 'chat'))
  expect(f.sessions.create).toHaveBeenCalledWith({ projectId: 42, workerId: 8 })
  expect(screen.queryByText('Worker creation')).toBeNull()
})

test('switching projects before session creation returns cannot navigate to the old project', async () => {
  const f = fixture([{ ...creation, status: 'succeeded', finishedAt: 1, workerId: 8 }])
  const session = deferred<SessionView>()
  f.sessions.create.mockReturnValueOnce(session.promise)
  const { rerender } = render(f.tree(42))
  fireEvent.click(await screen.findByRole('button', { name: 'app: Created' }))
  await screen.findByText(/Worker is connected/)
  fireEvent.click(screen.getByRole('button', { name: 'Start conversation' }))
  await vi.waitFor(() => expect(f.sessions.create).toHaveBeenCalled())
  f.workerCreations.listByProject.mockResolvedValue([])
  rerender(f.tree(99))
  await act(async () => session.resolve({ id: 9, name: 'old chat' } as SessionView))
  expect(f.open).not.toHaveBeenCalled()
  expect(screen.queryByText('Worker creation')).toBeNull()
})
