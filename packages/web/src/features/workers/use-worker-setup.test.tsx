import type { WorkerCreation } from '@baton/shared'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import type { Api } from '../../api'
import { ApiContext } from '../../app/api-context'
import { useWorkerSetup } from './use-worker-setup'

const creation: WorkerCreation = {
  id: 1,
  projectId: 42,
  machineId: 'mini',
  templateId: 'mini-local',
  name: 'app',
  agentKind: 'codex',
  status: 'pending',
  step: null,
  error: null,
  repoPath: null,
  workerId: null,
  createdAt: 0,
  updatedAt: 0,
  finishedAt: null,
}
const deferred = <T,>() => {
  let resolve: (value: T) => void = () => {
    throw new Error('Promise not initialized')
  }
  const promise = new Promise<T>(done => {
    resolve = done
  })
  return { promise, resolve }
}
const client = () => ({
  templates: vi.fn(async () => []),
  listByProject: vi.fn(async () => [creation]),
  create: vi.fn(async () => creation),
})
const wrapper =
  (workerCreations: Api['workerCreations']) =>
  ({ children }: { children: ReactNode }) => (
    <ApiContext.Provider value={{ workerCreations } as Api}>{children}</ApiContext.Provider>
  )

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

test('queries load independently; refresh errors preserve known creation data', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const api = client()
  api.templates.mockRejectedValue(new Error('template unavailable'))
  const { result } = renderHook(() => useWorkerSetup(42), { wrapper: wrapper(api) })
  await vi.waitFor(() => expect(result.current.creations.data).toEqual([creation]))
  expect(result.current.templates.error?.message).toBe('template unavailable')
  api.listByProject.mockRejectedValue(new Error('connection lost'))
  await act(async () => result.current.refresh())
  expect(result.current.creations.data).toEqual([creation])
  expect(result.current.creations.error?.message).toBe('connection lost')
  expect(result.current.creations.loading).toBe(false)
  expect(log).toHaveBeenCalled()
})

test('SSE invalidates creation data, polling covers missed events, and older replies cannot overwrite progress', async () => {
  vi.useFakeTimers()
  const sources: MockSource[] = []
  class MockSource {
    onmessage: ((event: { data: string }) => void) | null = null
    close = vi.fn()
    constructor(readonly url: string) {
      sources.push(this)
    }
  }
  vi.stubGlobal('EventSource', MockSource)
  const api = client()
  const { result, unmount } = renderHook(() => useWorkerSetup(42), { wrapper: wrapper(api) })
  await act(async () => undefined)
  const stale = deferred<WorkerCreation[]>()
  api.listByProject.mockImplementationOnce(() => stale.promise)
  await act(async () => vi.advanceTimersByTime(5000))
  const running = { ...creation, status: 'running' as const, step: 'git' as const }
  api.listByProject.mockResolvedValue([running])
  await act(async () =>
    sources[0]?.onmessage?.({ data: JSON.stringify({ resource: 'worker-creations' }) }),
  )
  expect(result.current.creations.data).toEqual([running])
  await act(async () => stale.resolve([creation]))
  expect(result.current.creations.data).toEqual([running])
  expect(sources[0]?.url).toBe('/api/projects/42/stream')
  unmount()
  expect(sources[0]?.close).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTime(5000))
  expect(api.listByProject).toHaveBeenCalledTimes(3)
})

test('accepted POST becomes visible immediately even when its refresh fails', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const api = client()
  api.listByProject.mockResolvedValue([])
  const { result } = renderHook(() => useWorkerSetup(42), { wrapper: wrapper(api) })
  await vi.waitFor(() => expect(result.current.creations.loading).toBe(false))
  api.listByProject.mockRejectedValue(new Error('read failed'))
  let accepted: WorkerCreation | null = null
  await act(async () => {
    accepted = await result.current.create({
      templateId: 'mini-local',
      name: 'app',
      agentKind: 'codex',
    })
  })
  expect(accepted).toEqual(creation)
  expect(result.current.creations.data).toEqual([creation])
  expect(result.current.creations.error?.message).toBe('read failed')
  expect(result.current.creating).toBe(false)
})

test('failed POST reports its error, refreshes records, and releases the submitting state', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const api = client()
  api.create.mockRejectedValue(new TypeError('Network failure'))
  const { result } = renderHook(() => useWorkerSetup(42), { wrapper: wrapper(api) })
  await vi.waitFor(() => expect(result.current.creations.loading).toBe(false))
  await act(async () =>
    expect(
      await result.current.create({ templateId: 'mini-local', name: 'app', agentKind: 'codex' }),
    ).toBeNull(),
  )
  expect(result.current.createError?.message).toBe('Network failure')
  expect(result.current.creating).toBe(false)
  expect(api.listByProject).toHaveBeenCalledTimes(2)
  expect(api.create).toHaveBeenCalledTimes(1)
  expect(log).toHaveBeenCalled()
})

test('project switch discards both old reads and old mutations', async () => {
  const api = client()
  const oldRead = deferred<WorkerCreation[]>()
  const oldCreate = deferred<WorkerCreation>()
  api.listByProject.mockImplementationOnce(() => oldRead.promise).mockResolvedValue([])
  api.create.mockReturnValueOnce(oldCreate.promise)
  const { result, rerender } = renderHook(({ projectId }) => useWorkerSetup(projectId), {
    initialProps: { projectId: 42 },
    wrapper: wrapper(api),
  })
  let post: Promise<WorkerCreation | null> | undefined
  act(() => {
    post = result.current.create({ templateId: 'mini-local', name: 'app', agentKind: 'codex' })
  })
  rerender({ projectId: 99 })
  await act(async () => undefined)
  await act(async () => {
    oldRead.resolve([creation])
    oldCreate.resolve(creation)
    expect(await post).toBeNull()
  })
  expect(result.current.creations.data).toEqual([])
  expect(result.current.creating).toBe(false)
  expect(api.listByProject).toHaveBeenLastCalledWith(99)
})

test('polling does not supersede pending reads before their deadline can report an error', async () => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  const api = client()
  const timeout = <T,>() =>
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new DOMException('Timed out', 'TimeoutError')), 10_000),
    )
  api.templates.mockImplementation(() => timeout())
  api.listByProject.mockImplementation(() => timeout())
  const { result } = renderHook(() => useWorkerSetup(42), { wrapper: wrapper(api) })
  await act(async () => vi.advanceTimersByTimeAsync(9999))
  expect(api.templates).toHaveBeenCalledTimes(1)
  expect(api.listByProject).toHaveBeenCalledTimes(1)
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(result.current.templates.loading).toBe(false)
  expect(result.current.templates.error?.message).toContain('Timed out')
  expect(result.current.creations.loading).toBe(false)
  expect(result.current.creations.error?.message).toContain('Timed out')
  await act(async () => vi.advanceTimersByTimeAsync(5000))
  expect(api.templates).toHaveBeenCalledTimes(2)
  expect(api.listByProject).toHaveBeenCalledTimes(2)
})
