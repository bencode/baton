import type { Session } from '@baton/shared'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { SessionHeader } from './session-header'

afterEach(cleanup)

const session = (shareToken: string | null): Session => ({
  id: 1,
  projectId: 1,
  workerId: 1,
  mode: 'worker',
  name: 'demo',
  agentKind: 'claude-code',
  agentSessionId: 'a1b2c3d4',
  worktreePath: '/tmp/wt',
  shareToken,
  createdAt: 0,
  updatedAt: 0,
  lastActiveAt: 0,
})

const renderHeader = (s: Session) =>
  render(
    <SessionHeader
      session={s}
      active={false}
      onStop={vi.fn()}
      onResume={vi.fn()}
      onRename={vi.fn()}
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
