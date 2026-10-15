import type { WorkerCreation, WorkerView } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { type Api, ApiError } from '../../api'
import { ApiContext } from '../../app/api-context'
import { AddWorker, type WorkerDialogView } from './add-worker'
import type { WorkerSetupState } from './use-worker-setup'
import { WorkerCreationProgress } from './worker-creation-progress'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const creation: WorkerCreation = {
  id: 5,
  projectId: 42,
  machineId: 'mini',
  templateId: 'mini-local',
  name: 'app',
  agentKind: 'codex',
  status: 'failed',
  step: 'connect',
  error: 'Connection timed out',
  repoPath: '/mini/projects/app',
  workerId: 8,
  createdAt: 1,
  updatedAt: 2,
  finishedAt: 2,
}
const readySetup = (): WorkerSetupState => ({
  templates: {
    data: [
      {
        id: 'mini-local',
        name: 'Mini local',
        agentKinds: ['claude-code', 'codex'],
        available: true,
      },
    ],
    loading: false,
    error: null,
  },
  creations: { data: [creation], loading: false, error: null },
  creating: false,
  createError: null,
  refresh: vi.fn(),
  create: vi.fn(async () => creation),
})
const renderDialog = (
  setup = readySetup(),
  view: WorkerDialogView = { kind: 'add' },
  workerGet = vi.fn(async () => ({ id: 8, projectId: 42, connected: false }) as WorkerView),
) => {
  const mintToken = vi.fn(async () => ({ token: 'tok-abc123' }))
  const onCreated = vi.fn()
  const onCreateAnother = vi.fn()
  const onStartConversation = vi.fn(async (_id: number) => undefined)
  const api = {
    auth: { me: vi.fn(async () => ({ hasToken: false })), mintToken },
    workers: { get: workerGet },
  } as unknown as Api
  render(
    <ApiContext.Provider value={api}>
      <AddWorker
        projectId={42}
        view={view}
        setup={setup}
        onCreated={onCreated}
        onCreateAnother={onCreateAnother}
        onStartConversation={onStartConversation}
        onClose={vi.fn()}
      />
    </ApiContext.Provider>,
  )
  return { mintToken, onCreated, onCreateAnother, onStartConversation }
}

test('template is default; the existing guide mints a token only on demand', async () => {
  const { mintToken } = renderDialog()
  expect(screen.getByLabelText('Worker name')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByLabelText('Worker name'))
  expect(mintToken).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Register existing' }))
  expect(screen.getByText('npm i -g @lesscap/baton-cli')).toBeTruthy()
  expect(screen.getByText(/baton worker register .+ --project 42$/)).toBeTruthy()
  expect(screen.getByText('baton worker run')).toBeTruthy()
  fireEvent.click(screen.getByText('Generate token'))
  expect(await screen.findByText('export BATON_TOKEN=tok-abc123')).toBeTruthy()
  expect(mintToken).toHaveBeenCalledTimes(1)
})

test('template submits a trimmed name and selected agent without minting credentials', async () => {
  const setup = readySetup()
  const { onCreated, mintToken } = renderDialog(setup)
  fireEvent.change(screen.getByLabelText('Worker name'), { target: { value: '  my-app  ' } })
  fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'codex' } })
  fireEvent.click(screen.getByRole('button', { name: 'Create worker' }))
  expect(setup.create).toHaveBeenCalledWith({
    templateId: 'mini-local',
    name: 'my-app',
    agentKind: 'codex',
  })
  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(creation))
  expect(mintToken).not.toHaveBeenCalled()
})

test.each([
  'loading',
  'unavailable',
  'error',
] as const)('%s templates disable creation while direct registration remains available', state => {
  const setup = readySetup()
  if (state === 'loading') setup.templates = { data: null, loading: true, error: null }
  if (state === 'unavailable' && setup.templates.data) setup.templates.data[0]!.available = false
  if (state === 'error') setup.templates.error = new Error('Network unavailable')
  renderDialog(setup)
  fireEvent.change(screen.getByLabelText('Worker name'), { target: { value: 'app' } })
  expect(
    (screen.getByRole('button', { name: 'Create worker' }) as HTMLButtonElement).disabled,
  ).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Register existing' }))
  expect(screen.getByText('baton worker run')).toBeTruthy()
  expect(setup.create).not.toHaveBeenCalled()
})

test.each([
  [new ApiError('conflict', 409), /name is already in use/],
  [new ApiError('offline', 503), /mini is unavailable/],
  [new DOMException('timed out', 'TimeoutError'), /may already have been accepted/],
  [new TypeError('Failed to fetch'), /Refresh creation records/],
] as const)('submission errors leave fields editable and expose recovery: %s', (error, message) => {
  const setup = readySetup()
  setup.createError = error
  renderDialog(setup, {
    kind: 'add',
    initialInput: { templateId: 'mini-local', name: 'previous', agentKind: 'codex' },
  })
  expect(screen.getByRole('alert').textContent).toMatch(message)
  const input = screen.getByLabelText('Worker name') as HTMLInputElement
  expect(input.disabled).toBe(false)
  expect(input.value).toBe('previous')
  fireEvent.change(input, { target: { value: 'another' } })
  expect(input.value).toBe('another')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh records' }))
  expect(setup.refresh).toHaveBeenCalled()
  expect(setup.create).not.toHaveBeenCalled()
})

test('failed details preserve resource information and refill only on explicit action', () => {
  const { onCreateAnother } = renderDialog(readySetup(), { kind: 'creation', creationId: 5 })
  expect(screen.getByRole('alert').textContent).toContain('Connection timed out')
  expect(screen.getByRole('alert').textContent).toContain('occupy this name')
  expect(screen.getByText('/mini/projects/app')).toBeTruthy()
  expect(screen.getByText('8')).toBeTruthy()
  expect(onCreateAnother).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Create another worker' }))
  expect(onCreateAnother).toHaveBeenCalledWith({
    templateId: 'mini-local',
    name: 'app',
    agentKind: 'codex',
  })
})

test.each([
  'offline',
  'deleted',
] as const)('successful history stays successful when the worker is %s', async state => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const setup = readySetup()
  setup.creations.data = [{ ...creation, status: 'succeeded', error: null }]
  const get = vi.fn(async () => {
    if (state === 'deleted') throw new ApiError('missing', 404)
    return { id: 8, projectId: 42, connected: false } as WorkerView
  })
  renderDialog(setup, { kind: 'creation', creationId: 5 }, get)
  await screen.findByText(state === 'deleted' ? /worker has been deleted/ : /Worker is offline/)
  expect(screen.getByText('Created')).toBeTruthy()
  expect(
    (screen.getByRole('button', { name: 'Start conversation' }) as HTMLButtonElement).disabled,
  ).toBe(true)
})

test('only a currently connected worker allows starting a conversation', async () => {
  const setup = readySetup()
  setup.creations.data = [{ ...creation, status: 'succeeded', error: null }]
  const { onStartConversation } = renderDialog(
    setup,
    { kind: 'creation', creationId: 5 },
    vi.fn(async () => ({ id: 8, projectId: 42, connected: true }) as WorkerView),
  )
  await screen.findByText(/Worker is connected/)
  fireEvent.click(screen.getByRole('button', { name: 'Start conversation' }))
  expect(onStartConversation).toHaveBeenCalledWith(8)
})

test('removing the worker association disables starting an already-open success detail', async () => {
  const api = {
    workers: {
      get: vi.fn(async () => ({ id: 8, projectId: 42, connected: true }) as WorkerView),
    },
  } as unknown as Api
  const onStartConversation = vi.fn(async (_id: number) => undefined)
  const detail = (workerId: number | null) => (
    <ApiContext.Provider value={api}>
      <WorkerCreationProgress
        creation={{ ...creation, status: 'succeeded', error: null, workerId }}
        onCreateAnother={vi.fn()}
        onStartConversation={onStartConversation}
      />
    </ApiContext.Provider>
  )
  const { rerender } = render(detail(8))
  await screen.findByText(/Worker is connected/)
  rerender(detail(null))
  expect(screen.getByText(/No worker is associated/)).toBeTruthy()
  const button = screen.getByRole('button', { name: 'Start conversation' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.click(button)
  expect(onStartConversation).not.toHaveBeenCalled()
})
