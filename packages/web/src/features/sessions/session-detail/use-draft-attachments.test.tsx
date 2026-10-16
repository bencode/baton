import type { Attachment } from '@baton/shared'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { Activity, type ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { createApi } from '../../../api'
import { ApiContext } from '../../../app/api-context'
import { type DraftAttachments, useDraftAttachments } from './use-draft-attachments'

afterEach(cleanup)
const attachment = (filename: string): Attachment => ({
  id: filename,
  filename,
  contentType: 'text/plain',
  size: 1,
  url: '/file',
  createdAt: 0,
})
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}
const setup = () => {
  const api = createApi()
  const upload = vi.spyOn(api.sessions, 'uploadAttachment')
  const wrapper = ({ children }: { children: ReactNode }) => (
    <ApiContext value={api}>{children}</ApiContext>
  )
  return { api, upload, wrapper }
}

test('overlapping batches keep selection order; partial failure retries only that row', async () => {
  const { upload, wrapper } = setup()
  const first = deferred<Attachment>()
  upload
    .mockReturnValueOnce(first.promise)
    .mockRejectedValueOnce(new Error('文件过大'))
    .mockResolvedValueOnce(attachment('third.txt'))
    .mockResolvedValueOnce(attachment('second.txt'))
  const hook = renderHook(() => useDraftAttachments(1), { wrapper })
  let batch!: Promise<void>
  act(() => {
    batch = hook.result.current.addFiles([
      new File(['a'], 'first.txt'),
      new File(['b'], 'second.txt'),
    ])
  })
  await act(() => hook.result.current.addFiles([new File(['c'], 'third.txt')]))
  expect(hook.result.current.items.map(item => item.status)).toEqual([
    'uploading',
    'failed',
    'ready',
  ])
  const failed = hook.result.current.items[1]
  if (!failed) throw new Error('missing failed upload')
  await act(() => hook.result.current.retry(failed.key))
  await act(async () => {
    first.resolve(attachment('first.txt'))
    await batch
  })
  expect(
    hook.result.current.items.map(item => item.status === 'ready' && item.attachment.filename),
  ).toEqual(['first.txt', 'second.txt', 'third.txt'])
  expect(upload).toHaveBeenCalledTimes(4)
})

test('removing an in-flight row cannot restore it when the upload completes', async () => {
  const { upload, wrapper } = setup()
  const pending = deferred<Attachment>()
  upload.mockReturnValue(pending.promise)
  const hook = renderHook(() => useDraftAttachments(1), { wrapper })
  let batch!: Promise<void>
  act(() => {
    batch = hook.result.current.addFiles([new File(['a'], 'first.txt')])
  })
  const key = hook.result.current.items[0]?.key
  if (!key) throw new Error('missing upload')
  act(() => hook.result.current.remove(key))
  await act(async () => {
    pending.resolve(attachment('first.txt'))
    await batch
  })
  expect(hook.result.current.items).toEqual([])
})

test('an upload finishing while an Activity tab is hidden survives showing the tab again', async () => {
  const { api, upload } = setup()
  const pending = deferred<Attachment>()
  upload.mockReturnValue(pending.promise)
  let state!: DraftAttachments
  const Host = () => {
    state = useDraftAttachments(1)
    return null
  }
  const view = render(
    <ApiContext value={api}>
      <Activity mode="visible">
        <Host />
      </Activity>
    </ApiContext>,
  )
  let batch!: Promise<void>
  act(() => {
    batch = state.addFiles([new File(['a'], 'first.txt')])
  })
  view.rerender(
    <ApiContext value={api}>
      <Activity mode="hidden">
        <Host />
      </Activity>
    </ApiContext>,
  )
  await act(async () => {
    pending.resolve(attachment('first.txt'))
    await batch
  })
  view.rerender(
    <ApiContext value={api}>
      <Activity mode="visible">
        <Host />
      </Activity>
    </ApiContext>,
  )
  expect(state.items[0]?.status).toBe('ready')
  expect(upload).toHaveBeenCalledOnce()
})
