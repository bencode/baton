import type { SessionEvent, SessionView } from '@baton/shared'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createApi } from '../../api'
import { ApiContext } from '../../app/api-context'
import { SessionDetail } from './session-detail'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const session: SessionView = {
  id: 1,
  projectId: 1,
  workerId: 1,
  mode: 'worker',
  name: '历史会话',
  agentKind: 'codex',
  agentSessionId: null,
  cwd: null,
  shareToken: null,
  createdAt: 0,
  updatedAt: 0,
  lastActiveAt: 0,
  planMode: false,
  model: null,
  effort: null,
  connected: true,
  attached: true,
  busy: false,
  activeLoops: 0,
  terminalOpen: false,
  worker: {
    id: 1,
    projectId: 1,
    agentKind: 'codex',
    machineId: 'local',
    name: 'local',
    hostname: 'local',
    createdAt: 0,
  },
}
const setup = () => {
  class EventSourceStub {
    static OPEN = 1
    close() {}
  }
  vi.stubGlobal('EventSource', EventSourceStub)
  const api = createApi()
  const get = vi.spyOn(api.sessions, 'get')
  const history = vi.spyOn(api.sessions, 'listEvents')
  const list = vi.spyOn(api.sessions, 'listByProject').mockResolvedValue([session])
  vi.spyOn(api.sessions, 'listQueue').mockResolvedValue({ revision: 0, items: [] })
  const mount = (access?: 'share') =>
    render(
      <ApiContext value={api}>
        <SessionDetail sessionId={1} access={access} />
      </ApiContext>,
    )
  return { get, history, list, mount }
}

test('session metadata and history have explicit loading states before empty is confirmed', async () => {
  const { get, history, mount } = setup()
  let finishSession!: (value: SessionView) => void
  let finishHistory!: (value: SessionEvent[]) => void
  get.mockReturnValue(
    new Promise(resolve => {
      finishSession = resolve
    }),
  )
  history.mockReturnValue(
    new Promise(resolve => {
      finishHistory = resolve
    }),
  )
  mount()
  expect(screen.getByRole('status').textContent).toBe('正在加载会话…')
  expect(screen.queryByText('从一条消息开始')).toBeNull()
  await act(async () => {
    finishSession(session)
  })
  expect(screen.getByText('正在加载聊天记录…')).toBeTruthy()
  expect(screen.queryByText('从一条消息开始')).toBeNull()
  await act(async () => {
    finishHistory([])
  })
  expect(screen.getByText('从一条消息开始')).toBeTruthy()
})

test('failed session lookup exposes a manual retry instead of permanent loading', async () => {
  const { get, history, mount } = setup()
  get.mockRejectedValueOnce(new Error('network unavailable')).mockResolvedValue(session)
  history.mockResolvedValue([])
  mount()
  expect((await screen.findByRole('alert')).textContent).toContain('network unavailable')
  fireEvent.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByText('从一条消息开始')).toBeTruthy()
  expect(get).toHaveBeenCalledTimes(2)
})

test('share mode reads only its session: no project list, no header, transcript instead of terminal', async () => {
  const { get, history, list, mount } = setup()
  get.mockResolvedValue({ ...session, terminalOpen: true })
  history.mockResolvedValue([])
  mount('share')
  expect(await screen.findByText('会话正在终端中使用，暂不能发送。')).toBeTruthy()
  expect(screen.getByText('从一条消息开始')).toBeTruthy()
  expect(screen.queryByText('历史会话')).toBeNull()
  expect(list).not.toHaveBeenCalled()
})
