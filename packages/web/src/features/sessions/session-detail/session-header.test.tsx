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
  fireEvent.click(screen.getByRole('button', { name: 'share' }))
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/s/tok123`)
  expect(screen.getByText('copied ✓')).toBeTruthy()
  vi.unstubAllGlobals()
})

test('no share button for legacy sessions without a shareToken', () => {
  renderHeader(session(null))
  expect(screen.queryByRole('button', { name: 'share' })).toBeNull()
})

test('terminal is available for a materialized Codex thread', () => {
  renderHeader(session(null, { agentKind: 'codex', agentSessionId: 'codex-thread' }))
  expect(screen.getByRole('button', { name: 'terminal' })).toBeTruthy()
})

test('terminal is hidden while a Codex thread id is pending', () => {
  renderHeader(session(null, { agentKind: 'codex', agentSessionId: 'pending:session-id' }))
  expect(screen.queryByRole('button', { name: 'terminal' })).toBeNull()
})

test('diagnostics are collapsed by default and the expanded native session id can be copied', () => {
  const writeText = vi.fn(async () => {})
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
  renderHeader(session('tok123'))
  expect(screen.queryByText('a1b2c3d4')).toBeNull()
  expect(screen.queryByText(/cwd:/)).toBeNull()
  expect(screen.queryByRole('button', { name: 'copy agent session id' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'show details' }))
  expect(screen.getByText('a1b2c3d4')).toBeTruthy()
  expect(screen.getByText('cwd: /tmp/wt')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'copy agent session id' }))
  expect(writeText).toHaveBeenCalledWith('a1b2c3d4')

  fireEvent.click(screen.getByRole('button', { name: 'hide details' }))
  expect(screen.queryByText('a1b2c3d4')).toBeNull()
  expect(screen.getByRole('button', { name: 'resume' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'share' })).toBeTruthy()
})

test('a pending null native session id has no copy action', () => {
  renderHeader(session(null, { agentSessionId: null }))
  fireEvent.click(screen.getByRole('button', { name: 'show details' }))
  expect(screen.getByText('(pending materialize)')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'copy agent session id' })).toBeNull()
})

test('renaming remains available without invoking session lifecycle actions', () => {
  const onRename = vi.fn()
  const onResume = vi.fn()
  renderHeader(session(null), { onRename, onResume })
  fireEvent.click(screen.getByRole('button', { name: 'demo' }))
  const input = screen.getByRole('textbox', { name: 'session name' })
  fireEvent.change(input, { target: { value: 'Refine requirements' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(onRename).toHaveBeenCalledExactlyOnceWith('Refine requirements')
  expect(onResume).not.toHaveBeenCalled()
  expect(screen.queryByRole('textbox', { name: 'session name' })).toBeNull()
})
