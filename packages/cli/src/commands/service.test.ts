import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

test('service CLI uses Worker environment and explicit cwd without a Session config', async () => {
  const cwd = await realpath(await mkdtemp(join(tmpdir(), 'baton-service-cli-')))
  const requests: unknown[] = []
  const server = createServer(async (request, response) => {
    assert.equal(request.url, '/workers/9/services')
    let body = ''
    for await (const chunk of request) body += chunk
    requests.push(JSON.parse(body))
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify({ requestId: 'run', ok: true }))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const run = (args: string[]) =>
    promisify(execFile)(
      process.execPath,
      [
        fileURLToPath(new URL('../../bin/baton.mjs', import.meta.url)),
        'service',
        'run',
        'web',
        ...args,
      ],
      {
        cwd,
        env: {
          ...process.env,
          BATON_SERVER: `http://127.0.0.1:${address.port}`,
          BATON_WORKER_ID: '9',
          BATON_WORKER_TOKEN: 'test',
          BATON_TOKEN: undefined,
          BATON_USER: undefined,
          BATON_PASS: undefined,
        },
      },
    )
  try {
    await run(['--cwd', '.', '--', 'pnpm', 'dev'])
    assert.deepEqual(requests, [{ cwd, name: 'web', argv: ['pnpm', 'dev'] }])
    await assert.rejects(run(['--', 'pnpm', 'dev']))
    assert.equal(requests.length, 1)
  } finally {
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    await rm(cwd, { recursive: true, force: true })
  }
})
