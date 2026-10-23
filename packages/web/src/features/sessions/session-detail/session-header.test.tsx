import type { Session } from '@baton/shared'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../../api'
import { ApiContext } from '../../../app/api-context'
import { SessionHeader } from './session-header'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const session = (shareToken: string | null, overrides: Partial<Session> = {}): Session => ({
  id: 1,
  projectId: 1,
  workerId: 1,
  mode: 'worker',
  name: 'demo',
  agentKind: 'claude-code',
  agentSessionId: 'a1b2c3d4',
  cwd: '/tmp/wt',
  shareToken,
  createdAt: 0,
  updatedAt: 0,
  lastActiveAt: 0,
  planMode: false,
  model: null,
  effort: null,
  ...overrides,
})

const renderHeader = (s: Session, overrides: Partial<ComponentProps<typeof SessionHeader>> = {}) =>
  render(
    <SessionHeader
      session={s}
      active={false}
      busy={false}
      connected={true}
      streamStatus="open"
      projectId={1}
      activeLoops={0}
      terminalOpen={false}
      onStop={vi.fn()}
      onResume={vi.fn()}
      onOpenTerminal={vi.fn()}
      onCloseTerminal={vi.fn()}
      onRename={vi.fn()}
      {...overrides}
    />,
  )

test('share button copies the standalone /s/:token link', () => {
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  renderHeader(session('tok123'))
  fireEvent.click(screen.getByRole('button', { name: '分享会话' }))
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/tok123`)
  expect(screen.getByText('已复制')).toBeTruthy()
  vi.unstubAllGlobals()
})

test('no share button for legacy sessions without a shareToken', () => {
  renderHeader(session(null))
  expect(screen.queryByRole('button', { name: '分享会话' })).toBeNull()
})

test('terminal is available for a materialized Codex thread', () => {
  renderHeader(session(null, { agentKind: 'codex', agentSessionId: 'codex-thread' }))
  expect(screen.getByRole('button', { name: '终端' })).toBeTruthy()
})

test('terminal is hidden while a Codex thread id is pending', () => {
  renderHeader(session(null, { agentKind: 'codex', agentSessionId: 'pending:session-id' }))
  expect(screen.queryByRole('button', { name: '终端' })).toBeNull()
})

test('diagnostics are collapsed by default and the expanded native session id can be copied', () => {
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  renderHeader(session('tok123'))
  expect(screen.queryByText('a1b2c3d4')).toBeNull()
  expect(screen.queryByText(/目录：/)).toBeNull()
  expect(screen.queryByRole('button', { name: '复制 Agent 会话标识' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: '显示详情' }))
  expect(screen.getByText('a1b2c3d4')).toBeTruthy()
  expect(screen.getByText('目录：/tmp/wt')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '复制 Agent 会话标识' }))
  expect(writeText).toHaveBeenCalledWith('a1b2c3d4')

  fireEvent.click(screen.getByRole('button', { name: '收起详情' }))
  expect(screen.queryByText('a1b2c3d4')).toBeNull()
  expect(screen.getByRole('button', { name: '恢复会话' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '分享会话' })).toBeTruthy()
})

test('a pending null native session id has no copy action', () => {
  renderHeader(session(null, { agentSessionId: null }))
  fireEvent.click(screen.getByRole('button', { name: '显示详情' }))
  expect(screen.getByText('尚未准备')).toBeTruthy()
  expect(screen.queryByRole('button', { name: '复制 Agent 会话标识' })).toBeNull()
})

test('renaming remains available without invoking session lifecycle actions', () => {
  const onRename = vi.fn()
  const onResume = vi.fn()
  renderHeader(session(null), { onRename, onResume })
  fireEvent.click(screen.getByRole('button', { name: 'demo' }))
  const input = screen.getByRole('textbox', { name: '会话名称' })
  fireEvent.change(input, { target: { value: 'Refine requirements' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onRename).toHaveBeenCalledExactlyOnceWith('Refine requirements')
  expect(onResume).not.toHaveBeenCalled()
  expect(screen.queryByRole('textbox', { name: '会话名称' })).toBeNull()
})

test.each([
  [{ busy: true, streamStatus: 'error' as const }, '状态待同步'],
  [{ busy: true, connected: false }, '执行环境离线'],
  [{ terminalOpen: true }, '终端中'],
  [{ busy: true }, '执行中'],
  [{ busy: false }, '空闲'],
])('header reflects display state without changing process control', (overrides, label) => {
  renderHeader(session(null), overrides)
  expect(screen.getByText(label)).toBeTruthy()
})

test('initial event diagnostics stay accessible without repeating them in the transcript', () => {
  renderHeader(session(null), {
    initialEvent: { model: 'actual-model', sessionId: 'initial-thread' },
  })
  expect(screen.queryByText('初始事件模型：actual-model')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '显示详情' }))
  expect(screen.getByText('初始事件模型：actual-model')).toBeTruthy()
  expect(screen.getByText('初始事件会话：initial-thread')).toBeTruthy()
})

const usePhoneViewport = () => {
  const matchMedia = window.matchMedia
  vi.stubGlobal('matchMedia', (query: string) => ({
    ...matchMedia(query),
    matches: query === '(max-width: 767px)',
  }))
}

const openMobileActions = () => {
  fireEvent.click(screen.getByRole('button', { name: '更多会话操作' }))
}

test.each([
  [{ active: true }, '停止进程', 'onStop'],
  [{ active: false }, '恢复会话', 'onResume'],
  [{ terminalOpen: true, active: true }, '关闭终端', 'onCloseTerminal'],
] as const)('mobile header exposes one lifecycle action for %s', (overrides, label, handler) => {
  usePhoneViewport()
  const callbacks = { onStop: vi.fn(), onResume: vi.fn(), onCloseTerminal: vi.fn() }
  renderHeader(session('tok123'), { ...overrides, ...callbacks })
  const button = screen.getByRole('button', { name: label })
  fireEvent.click(button)
  expect(callbacks[handler]).toHaveBeenCalledOnce()
  Object.entries(callbacks)
    .filter(([key]) => key !== handler)
    .forEach(([, callback]) => {
      expect(callback).not.toHaveBeenCalled()
    })
  expect(screen.queryByRole('button', { name: '分享会话' })).toBeNull()
  expect(screen.queryByRole('button', { name: '终端' })).toBeNull()
})

test('mobile actions preserve sharing, diagnostics and focus without stacking dialogs', async () => {
  usePhoneViewport()
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  renderHeader(session('tok123'), {
    activeLoops: 2,
    initialEvent: { model: 'actual-model', sessionId: 'initial-thread' },
  })
  const more = screen.getByRole('button', { name: '更多会话操作' })
  expect(more.getAttribute('aria-description')).toBe('2 个定时任务运行中')
  openMobileActions()
  expect(screen.getByRole('button', { name: /定时任务.*2.*个运行中/ })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '分享会话' }))
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/tok123`)
  expect(screen.getByText('已复制')).toBeTruthy()
  expect(screen.getByRole('dialog', { name: '会话操作' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '会话详情' }))
  expect(screen.queryByRole('dialog', { name: '会话操作' })).toBeNull()
  expect(screen.getAllByRole('dialog')).toHaveLength(1)
  expect(screen.getByText('初始事件模型：actual-model')).toBeTruthy()
  expect(screen.getByText('初始事件会话：initial-thread')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '复制 Agent 会话标识' }))
  expect(writeText).toHaveBeenLastCalledWith('a1b2c3d4')
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  await waitFor(() => expect(document.activeElement).toBe(more))
  openMobileActions()
  fireEvent.keyDown(screen.getByRole('dialog', { name: '会话操作' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(more)
})

test.each([
  [{ agentSessionId: 'pending:thread' }, false, false],
  [{ agentSessionId: 'thread' }, true, true],
  [{ agentSessionId: 'thread' }, false, true],
] as const)(
  'mobile terminal preserves pending and active process guards: %s %s',
  (overrides, active, available) => {
    usePhoneViewport()
    const onOpenTerminal = vi.fn()
    renderHeader(session(null, { agentKind: 'codex', ...overrides }), { active, onOpenTerminal })
    const more = screen.getByRole('button', { name: '更多会话操作' })
    openMobileActions()
    expect(screen.queryByRole('button', { name: '分享会话' })).toBeNull()
    const terminal = screen.queryByRole('button', { name: '终端' })
    if (active || !available) {
      expect(terminal).toBeNull()
      return
    }
    expect(terminal).toBeTruthy()
    fireEvent.click(terminal as HTMLButtonElement)
    expect(onOpenTerminal).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).toBeNull()
    return waitFor(() => expect(document.activeElement).toBe(more))
  },
)

test('mobile rename saves trimmed input, ignores unchanged names and cancels safely', async () => {
  usePhoneViewport()
  const onRename = vi.fn()
  renderHeader(session(null), { onRename })
  const more = screen.getByRole('button', { name: '更多会话操作' })
  const openRename = () => {
    openMobileActions()
    fireEvent.click(screen.getByRole('button', { name: '重命名会话' }))
    expect(screen.queryByRole('dialog', { name: '会话操作' })).toBeNull()
    return screen.getByRole('textbox', { name: '会话名称' })
  }
  fireEvent.change(openRename(), { target: { value: '   ' } })
  expect((screen.getByRole('button', { name: '保存' }) as HTMLButtonElement).disabled).toBe(true)
  fireEvent.change(screen.getByRole('textbox', { name: '会话名称' }), {
    target: { value: '  Refined name  ' },
  })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(onRename).toHaveBeenCalledExactlyOnceWith('Refined name')
  await waitFor(() => expect(document.activeElement).toBe(more))
  openRename()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(onRename).toHaveBeenCalledOnce()
  const input = openRename()
  fireEvent.change(input, { target: { value: 'Cancel this change' } })
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  expect(onRename).toHaveBeenCalledOnce()
  await waitFor(() => expect(document.activeElement).toBe(more))
  openRename()
  fireEvent(
    screen.getByRole('dialog', { name: '重命名会话' }),
    new Event('cancel', { cancelable: true }),
  )
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(onRename).toHaveBeenCalledOnce()
  await waitFor(() => expect(document.activeElement).toBe(more))
})

test('mobile scheduled tasks replace the actions panel and remain usable', async () => {
  usePhoneViewport()
  const create = vi.fn(async () => undefined)
  const api = {
    loops: { listBySession: vi.fn(async () => []), create },
  } as unknown as Api
  const view = render(
    <ApiContext value={api}>
      <SessionHeader
        session={session(null)}
        active={false}
        busy={false}
        connected={true}
        streamStatus="open"
        projectId={1}
        activeLoops={0}
        terminalOpen={false}
        onStop={vi.fn()}
        onResume={vi.fn()}
        onOpenTerminal={vi.fn()}
        onCloseTerminal={vi.fn()}
        onRename={vi.fn()}
      />
    </ApiContext>,
  )
  const more = screen.getByRole('button', { name: '更多会话操作' })
  openMobileActions()
  fireEvent.click(screen.getByRole('button', { name: '定时任务' }))
  expect(screen.queryByRole('dialog', { name: '会话操作' })).toBeNull()
  expect(screen.getByRole('dialog', { name: '定时任务' })).toBeTruthy()
  const message = await screen.findByLabelText(/消息/)
  fireEvent.mouseDown(message)
  fireEvent.change(message, { target: { value: 'Check the task list' } })
  fireEvent.click(screen.getByRole('button', { name: '创建任务' }))
  await waitFor(() =>
    expect(create).toHaveBeenCalledExactlyOnceWith(1, {
      message: 'Check the task list',
      intervalSec: 1800,
      clearEveryRuns: null,
    }),
  )
  expect(screen.getByRole('dialog', { name: '定时任务' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: '关闭' }))
  await waitFor(() => expect(document.activeElement).toBe(more))
  view.unmount()
})
