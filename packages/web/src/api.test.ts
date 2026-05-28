import { afterEach, expect, test, vi } from 'vitest'
import { createApi } from './api'

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
  const created = { id: 1, name: 'eng', createdAt: 0 }
  const fetchMock = vi.fn<typeof fetch>(async () => res(created, 201))
  vi.stubGlobal('fetch', fetchMock)
  expect(await createApi().workspaces.create({ name: 'eng' })).toEqual(created)
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/workspaces')
  const init = fetchMock.mock.calls[0]?.[1]
  expect(init?.method).toBe('POST')
  expect(JSON.parse(init?.body as string)).toEqual({ name: 'eng' })
})

test('requirements.setStatus PATCHes { status } to /api/requirements/:id', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res({ id: 1, status: 'done' }))
  vi.stubGlobal('fetch', fetchMock)
  await createApi().requirements.setStatus(1, 'done')
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/requirements/1')
  const init = fetchMock.mock.calls[0]?.[1]
  expect(init?.method).toBe('PATCH')
  expect(JSON.parse(init?.body as string)).toEqual({ status: 'done' })
})

test('requirements.getByCode hits /projects/:projectId/items/:code and unwraps item', async () => {
  const item = { id: 1, projectId: 1, code: 'R-1', title: 'login' }
  const fetchMock = vi.fn<typeof fetch>(async () => res({ kind: 'requirement', item }))
  vi.stubGlobal('fetch', fetchMock)
  const got = await createApi().requirements.getByCode(1, 'R-1')
  expect(got).toEqual(item)
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/projects/1/items/R-1')
})

test('tasks.getByCode rejects when server returns wrong kind', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res({ kind: 'requirement', item: { id: 1 } }))
  vi.stubGlobal('fetch', fetchMock)
  await expect(createApi().tasks.getByCode(1, 'R-1')).rejects.toThrow(/expected task/)
})

test('remove handles 204 (no throw)', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res(null, 204))
  vi.stubGlobal('fetch', fetchMock)
  await createApi().workspaces.remove(1)
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/workspaces/1',
    expect.objectContaining({ method: 'DELETE' }),
  )
})

test('non-2xx throws with status', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res({ error: 'nope' }, 404))
  vi.stubGlobal('fetch', fetchMock)
  await expect(createApi().workspaces.get(99)).rejects.toThrow(/404/)
})

test('sessions.listByProject hits /projects/:id/sessions', async () => {
  const fetchMock = vi.fn<typeof fetch>(async () => res([]))
  vi.stubGlobal('fetch', fetchMock)
  await createApi().sessions.listByProject(7)
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/projects/7/sessions')
})

test('sessions.sendMessage POSTs text to /sessions/:id/messages', async () => {
  const ev = { id: 1, sessionId: 7, sequence: 0, type: 'user_message', payload: { text: 'hi' } }
  const fetchMock = vi.fn<typeof fetch>(async () => res(ev, 201))
  vi.stubGlobal('fetch', fetchMock)
  const out = await createApi().sessions.sendMessage(7, 'hi')
  expect(out).toEqual(ev)
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/sessions/7/messages')
  const init = fetchMock.mock.calls[0]?.[1]
  expect(init?.method).toBe('POST')
  expect(JSON.parse(init?.body as string)).toEqual({ text: 'hi' })
})

test('sessions.getByCode unwraps session items', async () => {
  const item = { id: 1, code: 'S-1', name: 's', state: 'idle' }
  const fetchMock = vi.fn<typeof fetch>(async () => res({ kind: 'session', item }))
  vi.stubGlobal('fetch', fetchMock)
  const got = await createApi().sessions.getByCode(1, 'S-1')
  expect(got).toEqual(item)
  expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/projects/1/items/S-1')
})
