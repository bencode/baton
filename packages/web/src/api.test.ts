import { afterEach, expect, test, vi } from 'vitest'
import { createApi } from './api.ts'

const res = (body: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  }) as Response

afterEach(() => {
  vi.restoreAllMocks()
})

test('health hits /api/health (GET)', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res({ ok: true }))
  vi.stubGlobal('fetch', fetchMock)
  expect(await createApi().health()).toEqual({ ok: true })
  expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.objectContaining({ method: 'GET' }))
})

test('workspaces.create POSTs body to /api/workspaces', async () => {
  const created = { id: 'w1', name: 'eng', createdAt: 0 }
  const fetchMock = vi.fn<typeof fetch>(async () => res(created, 201))
  vi.stubGlobal('fetch', fetchMock)
  expect(await createApi().workspaces.create({ name: 'eng' })).toEqual(created)
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/workspaces')
  const init = fetchMock.mock.calls[0]?.[1]
  expect(init?.method).toBe('POST')
  expect(JSON.parse(init?.body as string)).toEqual({ name: 'eng' })
})

test('requirements.setStatus PATCHes { status } to /api/requirements/:id', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res({ id: 'r1', status: 'done' }))
  vi.stubGlobal('fetch', fetchMock)
  await createApi().requirements.setStatus('r1', 'done')
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/requirements/r1')
  const init = fetchMock.mock.calls[0]?.[1]
  expect(init?.method).toBe('PATCH')
  expect(JSON.parse(init?.body as string)).toEqual({ status: 'done' })
})

test('remove handles 204 (no throw)', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res(null, 204))
  vi.stubGlobal('fetch', fetchMock)
  await createApi().workspaces.remove('w1')
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/workspaces/w1',
    expect.objectContaining({ method: 'DELETE' }),
  )
})

test('non-2xx throws with status', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res({ error: 'nope' }, 404))
  vi.stubGlobal('fetch', fetchMock)
  await expect(createApi().workspaces.get('x')).rejects.toThrow(/404/)
})
