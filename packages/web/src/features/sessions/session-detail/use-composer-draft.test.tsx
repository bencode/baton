import type { Attachment, SessionView, SubmitInputResult } from '@baton/shared'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { createApi } from '../../../api'
import { ApiContext } from '../../../app/api-context'
import { useComposerDraft } from './use-composer-draft'
import { useDraftAttachments } from './use-draft-attachments'

afterEach(cleanup)
const attachment: Attachment = {
  id: 'a',
  filename: 'a.txt',
  contentType: 'text/plain',
  size: 1,
  url: '/a',
  createdAt: 0,
}
const result: SubmitInputResult = {
  input: {
    id: 1,
    sessionId: 2,
    text: '原草稿',
    images: [],
    attachments: [attachment],
    planMode: false,
    model: null,
    effort: null,
    replyExpected: false,
    createdAt: 0,
  },
  queue: { revision: 1, items: [] },
  sinceSequence: 0,
}
const setup = (resumeBeforeSend = false) => {
  const api = createApi()
  const resume = vi.spyOn(api.sessions, 'resume')
  const send = vi.spyOn(api.sessions, 'sendMessage')
  const upload = vi.spyOn(api.sessions, 'uploadAttachment').mockResolvedValue(attachment)
  const submitted = vi.fn()
  const hook = renderHook(
    ({ canSubmit }) => {
      const attachments = useDraftAttachments(2)
      const draft = useComposerDraft({
        sessionId: 2,
        attachments,
        canSubmit,
        resumeBeforeSend,
        onSubmitted: submitted,
      })
      return { attachments, draft }
    },
    {
      initialProps: { canSubmit: true },
      wrapper: ({ children }: { children: ReactNode }) => (
        <ApiContext value={api}>{children}</ApiContext>
      ),
    },
  )
  return { hook, resume, send, submitted, upload }
}

test('one in-flight submission preserves new typing and consumes only submitted attachments', async () => {
  const { hook, resume, send, submitted } = setup()
  let done!: (value: SubmitInputResult) => void
  send.mockReturnValue(
    new Promise(resolve => {
      done = resolve
    }),
  )
  act(() => hook.result.current.draft.setText('  原草稿  '))
  await act(() => hook.result.current.attachments.addFiles([new File(['a'], 'a.txt')]))
  let pending!: Promise<boolean>
  act(() => {
    pending = hook.result.current.draft.submit()
    void hook.result.current.draft.submit()
  })
  expect(resume).not.toHaveBeenCalled()
  expect(send).toHaveBeenCalledExactlyOnceWith(2, '原草稿', [attachment])
  act(() => hook.result.current.draft.setText('下一条草稿'))
  await act(() => hook.result.current.attachments.addFiles([new File(['b'], 'b.txt')]))
  await act(async () => {
    done(result)
    expect(await pending).toBe(true)
  })
  expect(hook.result.current.draft.text).toBe('下一条草稿')
  expect(hook.result.current.attachments.items).toHaveLength(1)
  expect(submitted).toHaveBeenCalledWith(result)
})

test('resumes an inactive session before sending', async () => {
  const { hook, resume, send } = setup(true)
  const calls: string[] = []
  resume.mockImplementation(async () => {
    calls.push('resume')
    return {} as SessionView
  })
  send.mockImplementation(async () => {
    calls.push('send')
    return result
  })
  act(() => hook.result.current.draft.setText('继续处理'))

  await act(() => hook.result.current.draft.submit())

  expect(calls).toEqual(['resume', 'send'])
})

test('resume failure retains the draft and skips sending', async () => {
  const { hook, resume, send } = setup(true)
  resume.mockRejectedValue(new Error('恢复失败'))
  act(() => hook.result.current.draft.setText('保留草稿'))

  await act(() => hook.result.current.draft.submit())

  expect(send).not.toHaveBeenCalled()
  expect(hook.result.current.draft.text).toBe('保留草稿')
  expect(hook.result.current.draft.error).toContain('恢复失败')
})

test('failure retains text and files; manual retry clears only unchanged raw text', async () => {
  const { hook, send } = setup()
  send.mockRejectedValueOnce(new Error('409 Worker offline')).mockResolvedValue(result)
  act(() => hook.result.current.draft.setText('原草稿'))
  await act(() => hook.result.current.attachments.addFiles([new File(['a'], 'a.txt')]))
  await act(() => hook.result.current.draft.submit())
  expect(hook.result.current.draft.text).toBe('原草稿')
  expect(hook.result.current.attachments.items).toHaveLength(1)
  expect(hook.result.current.draft.error).toContain('409 Worker offline')
  expect(hook.result.current.draft.sending).toBe(false)
  await act(() => hook.result.current.draft.submit())
  expect(hook.result.current.draft.text).toBe('')
  expect(hook.result.current.attachments.items).toEqual([])
})

test('connection/settings gate and unresolved attachments prevent submission', async () => {
  const { hook, send, upload } = setup()
  act(() => hook.result.current.draft.setText('待发送'))
  hook.rerender({ canSubmit: false })
  await act(() => hook.result.current.draft.submit())
  expect(send).not.toHaveBeenCalled()
  hook.rerender({ canSubmit: true })
  expect(hook.result.current.draft.canSend).toBe(true)
  upload.mockRejectedValueOnce(new Error('上传失败'))
  await act(() => hook.result.current.attachments.addFiles([new File(['a'], 'a.txt')]))
  await act(() => hook.result.current.draft.submit())
  expect(send).not.toHaveBeenCalled()
  expect(hook.result.current.draft.canSend).toBe(false)
})
