import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

test('CLI submits a worker request and exposes template/list/detail queries', async () => {
  const requests: { method: string; path: string; body: unknown; auth: string | undefined }[] = []
  const creation = {
    id: 19,
    projectId: 7,
    templateId: 'mini-codex',
    name: 'my worker',
    agentKind: 'codex',
    status: 'pending',
    step: null,
    workerId: null,
    error: null,
  }
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    const text = Buffer.concat(chunks).toString()
    requests.push({
      method: req.method ?? '',
      path: req.url ?? '',
      body: text ? JSON.parse(text) : undefined,
      auth: req.headers.authorization,
    })
    res.setHeader('content-type', 'application/json')
    res.end(
      JSON.stringify(
        req.url?.endsWith('worker-templates')
          ? [
              {
                id: 'mini-codex',
                name: 'mini',
                agentKinds: ['codex'],
                available: true,
              },
            ]
          : req.method === 'GET' && req.url?.startsWith('/projects/')
            ? [creation]
            : creation,
      ),
    )
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const bin = fileURLToPath(new URL('../../../bin/baton.mjs', import.meta.url))
  const run = async (args: string[]) =>
    JSON.parse(
      (
        await promisify(execFile)(
          process.execPath,
          [bin, 'worker', ...args, '--url', `http://127.0.0.1:${address.port}`, '--json'],
          {
            env: {
              ...process.env,
              BATON_TOKEN: 'user-token',
              BATON_USER: undefined,
              BATON_PASS: undefined,
            },
          },
        )
      ).stdout,
    )
  try {
    assert.equal((await run(['templates', '--project', '7']))[0].available, true)
    assert.equal(
      (await run(['create', '--project', '7', '--template', 'mini-codex', '--name', 'my worker']))
        .id,
      19,
    )
    assert.equal((await run(['creation', 'ls', '--project', '7']))[0].id, 19)
    assert.equal((await run(['creation', 'get', '19'])).id, 19)
    assert.deepEqual(
      requests.map(r => [r.method, r.path]),
      [
        ['GET', '/projects/7/worker-templates'],
        ['POST', '/projects/7/worker-creations'],
        ['GET', '/projects/7/worker-creations'],
        ['GET', '/worker-creations/19'],
      ],
    )
    assert.deepEqual(requests[1]?.body, {
      templateId: 'mini-codex',
      name: 'my worker',
      agentKind: 'codex',
    })
    assert.ok(requests.every(r => r.auth === 'Bearer user-token'))
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close(error => (error ? reject(error) : resolve())),
    )
  }
})
