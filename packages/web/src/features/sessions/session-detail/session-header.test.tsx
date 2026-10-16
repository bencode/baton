import type { Session } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
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
