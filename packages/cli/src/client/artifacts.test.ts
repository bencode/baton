import assert from 'node:assert/strict'
import { afterEach, describe, test } from 'node:test'
import type { Artifact } from '@baton/shared'
import { artifactsClient } from './artifacts.ts'
import { setAuthHeaders } from './request.ts'

describe('artifactsClient', () => {
  const originalFetch = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = originalFetch
    setAuthHeaders({})
  })

  test('publishes a raw Blob with bearer auth and file metadata', async () => {
    const expected: Artifact = {
      id: 1,
      projectId: 7,
      key: 'abc123',
      filename: 'report.txt',
      contentType: 'text/plain',
      size: 5,
      url: 'https://baton.example/a/abc123',
      downloadUrl: 'https://baton.example/a/abc123?download=1',
      createdAt: 1,
    }
    setAuthHeaders({ authorization: 'Bearer worker-token' })
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'https://baton.example/artifacts?projectId=7&filename=report.txt')
      assert.equal(init?.method, 'POST')
      assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer worker-token')
      assert.equal(new Headers(init?.headers).get('content-type'), 'text/plain')
      assert.equal(await (init?.body as Blob).text(), 'hello')
      return Response.json(expected)
    }

    const artifact = await artifactsClient('https://baton.example').publish(7, {
      filename: 'report.txt',
      contentType: 'text/plain',
      body: new Blob(['hello']),
    })
    assert.deepEqual(artifact, expected)
  })
})
