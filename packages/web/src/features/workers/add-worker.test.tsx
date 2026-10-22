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
  const me = vi.fn<Api['auth']['me']>(async () => ({
    authRequired: true,
    user: { id: 1, username: 'member', createdAt: 0, isAdmin: false },
    hasToken: false,
  }))
  const mintToken = vi.fn(async () => ({ token: 'tok-abc123' }))
  const onCreated = vi.fn()
  const onCreateAnother = vi.fn()
  const onStartConversation = vi.fn(async (_id: number) => undefined)
  const api = {
    auth: { me, mintToken },
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
  return { me, mintToken, onCreated, onCreateAnother, onStartConversation }
}

test('template is default; the existing guide mints a token only on demand', async () => {
  const { mintToken } = renderDialog()
  expect(screen.getByLabelText('名称')).toBeTruthy()
  await vi.waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('名称')))
  expect(mintToken).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '注册已有环境' }))
  expect(screen.getByText('npm i -g @lesscap/baton-cli')).toBeTruthy()
  expect(screen.getByText(/baton worker register .+ --project 42$/)).toBeTruthy()
  expect(screen.getByText('baton worker run')).toBeTruthy()
  fireEvent.click(await screen.findByText('生成 Token'))
  expect(await screen.findByText('export BATON_TOKEN=tok-abc123')).toBeTruthy()
  expect(mintToken).toHaveBeenCalledTimes(1)
})

test('template submits a trimmed name and selected agent without minting credentials', async () => {
  const setup = readySetup()
  const { onCreated, mintToken } = renderDialog(setup)
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '  my-app  ' } })
  fireEvent.change(screen.getByLabelText('Agent'), { target: { value: 'codex' } })
  fireEvent.click(screen.getByRole('button', { name: '创建执行环境' }))
  expect(setup.create).toHaveBeenCalledWith({
    templateId: 'mini-local',
    name: 'my-app',
    agentKind: 'codex',
  })
  await vi.waitFor(() => expect(onCreated).toHaveBeenCalledWith(creation))
  expect(mintToken).not.toHaveBeenCalled()
})

test.each(['loading', 'unavailable', 'error'] as const)(
  '%s templates disable creation while direct registration remains available',
  state => {
    const setup = readySetup()
    if (state === 'loading') setup.templates = { data: null, loading: true, error: null }
    if (state === 'unavailable' && setup.templates.data) setup.templates.data[0]!.available = false
    if (state === 'error') setup.templates.error = new Error('Network unavailable')
    renderDialog(setup)
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: 'app' } })
    expect(
      (screen.getByRole('button', { name: '创建执行环境' }) as HTMLButtonElement).disabled,
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '注册已有环境' }))
    expect(screen.getByText('baton worker run')).toBeTruthy()
    expect(setup.create).not.toHaveBeenCalled()
  },
)

test.each([
  [new ApiError('conflict', 409), /名称已被占用/],
  [new ApiError('offline', 503), /mini 暂时不可用/],
  [new DOMException('timed out', 'TimeoutError'), /可能已接受/],
  [new TypeError('Failed to fetch'), /先刷新状态/],
] as const)('submission errors leave fields editable and expose recovery: %s', (error, message) => {
  const setup = readySetup()
  setup.createError = error
  renderDialog(setup, {
    kind: 'add',
    initialInput: { templateId: 'mini-local', name: 'previous', agentKind: 'codex' },
  })
  expect(screen.getByRole('alert').textContent).toMatch(message)
  const input = screen.getByLabelText('名称') as HTMLInputElement
  expect(input.disabled).toBe(false)
  expect(input.value).toBe('previous')
  fireEvent.change(input, { target: { value: 'another' } })
  expect(input.value).toBe('another')
  fireEvent.click(screen.getByRole('button', { name: '刷新状态' }))
  expect(setup.refresh).toHaveBeenCalled()
  expect(setup.create).not.toHaveBeenCalled()
})

test('failed details preserve resource information and refill only on explicit action', () => {
  const { onCreateAnother } = renderDialog(readySetup(), { kind: 'creation', creationId: 5 })
  expect(screen.getByRole('alert').textContent).toContain('Connection timed out')
  expect(screen.getByRole('alert').textContent).toContain('仍占用此名称')
  expect(screen.getByText('/mini/projects/app')).toBeTruthy()
  expect(screen.getByText('8')).toBeTruthy()
  expect(onCreateAnother).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '再创建一个执行环境' }))
  expect(onCreateAnother).toHaveBeenCalledWith({
    templateId: 'mini-local',
    name: 'app',
    agentKind: 'codex',
  })
})

test.each(['offline', 'deleted'] as const)(
  'successful history stays successful when the worker is %s',
  async state => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const setup = readySetup()
    setup.creations.data = [{ ...creation, status: 'succeeded', error: null }]
    const get = vi.fn(async () => {
      if (state === 'deleted') throw new ApiError('missing', 404)
      return { id: 8, projectId: 42, connected: false } as WorkerView
    })
    renderDialog(setup, { kind: 'creation', creationId: 5 }, get)
    await screen.findByText(state === 'deleted' ? /执行环境已删除/ : /执行环境已离线/)
    expect(screen.getByText('已创建')).toBeTruthy()
    expect((screen.getByRole('button', { name: '开始会话' }) as HTMLButtonElement).disabled).toBe(
      true,
    )
  },
)

test('only a currently connected worker allows starting a conversation', async () => {
  const setup = readySetup()
  setup.creations.data = [{ ...creation, status: 'succeeded', error: null }]
  const { onStartConversation } = renderDialog(
    setup,
    { kind: 'creation', creationId: 5 },
    vi.fn(async () => ({ id: 8, projectId: 42, connected: true }) as WorkerView),
  )
  await screen.findByText(/执行环境已连接/)
  fireEvent.click(screen.getByRole('button', { name: '开始会话' }))
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
  await screen.findByText(/执行环境已连接/)
  rerender(detail(null))
  expect(screen.getByText(/没有关联的执行环境/)).toBeTruthy()
  const button = screen.getByRole('button', { name: '开始会话' }) as HTMLButtonElement
  expect(button.disabled).toBe(true)
  fireEvent.click(button)
  expect(onStartConversation).not.toHaveBeenCalled()
})

test('local registration needs no personal token', async () => {
  const { me, mintToken } = renderDialog()
  me.mockResolvedValueOnce({ authRequired: false, user: null, hasToken: false })
  fireEvent.click(screen.getByRole('button', { name: '注册已有环境' }))
  expect(await screen.findByText(/本地模式无需个人 Token/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: '生成 Token' })).toBeNull()
  expect(mintToken).not.toHaveBeenCalled()
})

test('identity failure can be retried without pretending to be local mode', async () => {
  const { me } = renderDialog()
  me.mockRejectedValueOnce(new Error('Network unavailable'))
  fireEvent.click(screen.getByRole('button', { name: '注册已有环境' }))
  expect((await screen.findByRole('alert')).textContent).toContain('无法加载认证信息')
  expect(screen.queryByText(/本地模式无需/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('button', { name: '生成 Token' })).toBeTruthy()
})

test('token generation failure remains visible and allows a manual retry', async () => {
  const { mintToken } = renderDialog()
  mintToken.mockRejectedValueOnce(new Error('Network unavailable'))
  fireEvent.click(screen.getByRole('button', { name: '注册已有环境' }))
  fireEvent.click(await screen.findByRole('button', { name: '生成 Token' }))
  expect((await screen.findByRole('alert')).textContent).toContain('无法生成 Token')
  fireEvent.click(screen.getByRole('button', { name: '生成 Token' }))
  expect(await screen.findByText('export BATON_TOKEN=tok-abc123')).toBeTruthy()
  expect(mintToken).toHaveBeenCalledTimes(2)
})
