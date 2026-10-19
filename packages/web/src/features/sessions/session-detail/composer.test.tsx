import type { SessionView, SubmitInputResult } from '@baton/shared'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Activity } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { type Api, createApi } from '../../../api'
import { ApiContext } from '../../../app/api-context'
import { Composer } from './composer'
import { useComposerControls } from './use-composer-controls'
import { useComposerDraft } from './use-composer-draft'
import { useDraftAttachments } from './use-draft-attachments'

afterEach(cleanup)
const current = {
  id: 1,
  planMode: false,
  model: null,
  effort: null,
  busy: false,
  attached: true,
  connected: true,
} as SessionView
const submitted: SubmitInputResult = {
  input: {
    id: 2,
    sessionId: 1,
    text: '',
    attachments: [],
    images: [],
    planMode: false,
    model: null,
    effort: null,
    replyExpected: false,
    createdAt: 0,
  },
  queue: { revision: 1, items: [] },
  sinceSequence: 0,
}
const Host = ({ session = current, known = true }: { session?: SessionView; known?: boolean }) => {
  const controls = useComposerControls({ session, onRefresh: vi.fn() })
  const attachments = useDraftAttachments(session.id)
  const draft = useComposerDraft({
    sessionId: session.id,
    attachments,
    canSubmit: session.connected && session.attached && !controls.pending && !controls.saving,
    onSubmitted: vi.fn(),
  })
  return (
    <Composer
      session={session}
      statusKnown={known}
      agentKind="codex"
      draft={draft}
      attachments={attachments}
      controls={controls}
      queue={null}
    />
  )
}
const setup = (session = current) => {
  const api = createApi()
  const send = vi.spyOn(api.sessions, 'sendMessage').mockResolvedValue(submitted)
  const setModel = vi.spyOn(api.sessions, 'setModel')
  const setMode = vi
    .spyOn(api.sessions, 'setMode')
    .mockResolvedValue({ ...session, planMode: true })
  const abort = vi.spyOn(api.sessions, 'abort').mockResolvedValue(session)
  const view = render(
    <ApiContext value={api}>
      <Host session={session} />
    </ApiContext>,
  )
  return { api, send, setModel, setMode, abort, view }
}
const write = (value: string) =>
  fireEvent.change(screen.getByRole('textbox', { name: '消息' }), { target: { value } })
const feedback = () => {
  const id = screen.getByRole('textbox', { name: '消息' }).getAttribute('aria-describedby')
  const element = id && document.getElementById(id)
  if (!element) throw new Error('消息缺少反馈关联')
  return element
}

test('the message description stays empty when ready and shows offline status', () => {
  const { api, view } = setup()
  expect(feedback().textContent).toBe('')
  view.rerender(
    <ApiContext value={api}>
      <Host session={{ ...current, connected: false }} />
    </ApiContext>,
  )
  expect(feedback().textContent).toBe('执行环境离线，连接恢复后可发送。')
})

test('all current errors remain visible together and replace lower-priority footer content', async () => {
  const { api, send, setMode, view } = setup()
  send.mockRejectedValueOnce(new Error('发送请求失败'))
  setMode.mockRejectedValueOnce(new Error('配置请求失败'))
  vi.spyOn(api.sessions, 'uploadAttachment').mockRejectedValueOnce(new Error('文件上传失败'))
  write('保留这条草稿')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '发送' })))
  const picker = view.container.querySelector<HTMLInputElement>('input[type="file"]')
  if (!picker) throw new Error('缺少文件选择入口')
  await act(async () => fireEvent.change(picker, { target: { files: [new File(['a'], 'a.txt')] } }))
  view.rerender(
    <ApiContext value={api}>
      <Host session={{ ...current, connected: false }} />
    </ApiContext>,
  )
  write('/plan')
  await act(async () =>
    fireEvent.keyDown(screen.getByRole('textbox', { name: '消息' }), { key: 'Enter' }),
  )
  const error = within(feedback()).getByRole('alert')
  expect(error.textContent).toContain('发送请求失败')
  expect(error.textContent).toContain('配置请求失败')
  expect(error.textContent).toContain('部分附件上传失败，请重试或移除后再发送。')
  expect(feedback().textContent).not.toContain('执行环境离线')
})

test('the inactive footer keeps resume and replaces its hint with the request acknowledgement', async () => {
  const { api, send } = setup({ ...current, attached: false })
  const resume = vi.spyOn(api.sessions, 'resume').mockResolvedValue({ ...current, attached: false })
  expect(feedback().textContent).toContain('会话未启动，恢复后可发送。')
  await act(async () =>
    fireEvent.click(within(feedback()).getByRole('button', { name: '恢复会话' })),
  )
  expect(resume).toHaveBeenCalledExactlyOnceWith(1)
  expect(within(feedback()).getByRole('status').textContent).toBe('已请求恢复会话，等待连接。')
  expect(feedback().textContent).not.toContain('会话未启动')
  expect(send).not.toHaveBeenCalled()
})

test('IME Enter and Shift+Enter do not send; Ctrl+Enter sends once and keeps focus', async () => {
  const { send } = setup()
  const input = screen.getByRole('textbox', { name: '消息' })
  write('中文输入')
  fireEvent.keyDown(input, { key: 'Enter', isComposing: true })
  fireEvent.keyDown(input, { key: 'Enter', keyCode: 229 })
  fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
  expect(send).not.toHaveBeenCalled()
  await act(async () => fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true }))
  expect(send).toHaveBeenCalledExactlyOnceWith(1, '中文输入', [])
})

test('command list retains textarea focus; bare /model resets and unknown slash is a message', async () => {
  const { send, setModel } = setup()
  setModel.mockResolvedValue(current)
  const input = screen.getByRole('textbox', { name: '消息' })
  input.focus()
  write('/model')
  expect(screen.getByRole('listbox', { name: '会话命令' })).toBeTruthy()
  expect(document.activeElement).toBe(input)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '执行命令' })))
  expect(setModel).toHaveBeenCalledWith(1, null, null)
  expect(send).not.toHaveBeenCalled()
  write('/unknown text')
  await act(async () => fireEvent.keyDown(input, { key: 'Enter' }))
  expect(send).toHaveBeenCalledWith(1, '/unknown text', [])
})

test('known commands retain text on failure and remain usable offline', async () => {
  const { setMode, send } = setup({ ...current, attached: false, connected: false })
  setMode.mockRejectedValue(new Error('配置保存失败'))
  write('/plan')
  await act(async () =>
    fireEvent.keyDown(screen.getByRole('textbox', { name: '消息' }), { key: 'Enter' }),
  )
  expect((screen.getByRole('textbox', { name: '消息' }) as HTMLTextAreaElement).value).toBe('/plan')
  expect(screen.getByRole('alert').textContent).toContain('配置保存失败')
  expect(send).not.toHaveBeenCalled()
})

test('busy and unknown states use honest labels; Escape closes commands before stopping', async () => {
  const { api, view, abort } = setup({ ...current, busy: true })
  write('接着做')
  expect(screen.getByRole('button', { name: '加入队列' })).toBeTruthy()
  write('/p')
  fireEvent.keyDown(screen.getByRole('textbox', { name: '消息' }), { key: 'Escape' })
  expect(screen.queryByRole('listbox')).toBeNull()
  expect(abort).not.toHaveBeenCalled()
  await act(async () =>
    fireEvent.keyDown(screen.getByRole('textbox', { name: '消息' }), { key: 'Escape' }),
  )
  expect(abort).toHaveBeenCalledOnce()
  view.rerender(
    <ApiContext value={api}>
      <Host session={{ ...current, busy: true }} known={false} />
    </ApiContext>,
  )
  write('下一条')
  expect(screen.getByRole('button', { name: '发送' })).toBeTruthy()
  expect(screen.getByText('等待状态同步…')).toBeTruthy()
})

test('model failure keeps the form and custom ID; effort includes minimal and preserves the model', async () => {
  const { setModel } = setup()
  setModel
    .mockRejectedValueOnce(new Error('网关暂时不可用'))
    .mockResolvedValueOnce({ ...current, model: 'gateway/custom' })
    .mockResolvedValueOnce({ ...current, model: 'gateway/custom', effort: 'minimal' })
  fireEvent.click(screen.getByRole('button', { name: '选择模型：默认模型' }))
  const dialog = screen.getByRole('dialog', { name: '模型设置' })
  fireEvent.change(within(dialog).getByLabelText('自定义模型 ID'), {
    target: { value: ' gateway/custom ' },
  })
  await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: '应用' })))
  expect(within(dialog).getByRole('alert').textContent).toBe('网关暂时不可用')
  expect((within(dialog).getByLabelText('自定义模型 ID') as HTMLInputElement).value).toBe(
    ' gateway/custom ',
  )
  await act(async () => fireEvent.click(within(dialog).getByRole('button', { name: '应用' })))
  expect(screen.queryByRole('dialog')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: '思考强度：默认' }))
  await act(async () =>
    fireEvent.click(screen.getByRole('menuitemradio', { name: '最低 · minimal' })),
  )
  expect(setModel).toHaveBeenLastCalledWith(1, 'gateway/custom', 'minimal')
})

test('drafts stay isolated across Activity tabs and a hidden submission still finishes', async () => {
  const api: Api = createApi()
  let done!: (result: SubmitInputResult) => void
  vi.spyOn(api.sessions, 'sendMessage').mockReturnValue(
    new Promise(resolve => {
      done = resolve
    }),
  )
  const tabs = (second: boolean) => (
    <ApiContext value={api}>
      <Activity mode={second ? 'hidden' : 'visible'}>
        <Host />
      </Activity>
      <Activity mode={second ? 'visible' : 'hidden'}>
        <Host session={{ ...current, id: 2 }} />
      </Activity>
    </ApiContext>
  )
  const view = render(tabs(false))
  write('第一个会话')
  fireEvent.click(screen.getByRole('button', { name: '发送' }))
  write('新草稿')
  view.rerender(tabs(true))
  write('第二个会话')
  await act(async () => {
    done(submitted)
  })
  view.rerender(tabs(false))
  expect((screen.getByRole('textbox', { name: '消息' }) as HTMLTextAreaElement).value).toBe(
    '新草稿',
  )
  expect((screen.getByRole('button', { name: '发送' }) as HTMLButtonElement).disabled).toBe(false)
  view.rerender(tabs(true))
  expect((screen.getByRole('textbox', { name: '消息' }) as HTMLTextAreaElement).value).toBe(
    '第二个会话',
  )
})
