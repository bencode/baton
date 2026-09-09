import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HttpError } from './request.ts'
import { sessionExecutionClient } from './session-execution.ts'

test('claim and finish retries preserve identities; a stale attempt is rejected without retry', async t => {
  const requests: { url: string; body: unknown; authorization?: string }[] = []
  let count = 0
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    requests.push({
      url,
      body: JSON.parse(String(init.body)),
      authorization: new Headers(init.headers).get('authorization') ?? undefined,
    })
    count++
    return new Response(JSON.stringify(count % 2 ? { error: 'temporary' } : { kind: 'idle' }), {
      status: count % 2 ? 503 : 200,
    })
  })
  const client = sessionExecutionClient('http://server', 7, { authorization: 'Bearer worker' })
  await client.claim({ claimId: 'stable', runnerToken: 'runner' })
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0], requests[1])
  assert.equal(requests[0]?.url, 'http://server/sessions/7/turns/claim')
  requests.length = 0
  await client.forAttempt(8, 'runner').finish({ outcome: 'completed' })
  assert.equal(requests.length, 2)
  assert.deepEqual(requests[0], requests[1])
  assert.deepEqual(requests[0]?.body, { outcome: 'completed', runnerToken: 'runner' })
  fetchMock.mock.mockImplementation(async () => new Response('stale', { status: 409 }))
  const before = fetchMock.mock.callCount()
  await assert.rejects(
    client.forAttempt(8, 'runner').finish({ outcome: 'completed' }),
    error => error instanceof HttpError && error.status === 409,
  )
  assert.equal(fetchMock.mock.callCount() - before, 1)
})
