import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

type StubServer = {
  server: Server
  url: string
  active: Promise<void>
}

const startStubServer = async (worktreePath: string): Promise<StubServer> => {
  let markActive: () => void = () => {}
  const active = new Promise<void>(resolve => {
    markActive = resolve
  })
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const json = (value: unknown): void => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(value))
    }
    if (request.method === 'GET' && url.pathname === '/sessions/1') {
      json({
        id: 1,
        name: 'ipc-exit-test',
        agentKind: 'codex',
        agentSessionId: 'thread-id',
        worktreePath,
      })
      return
    }
    if (request.method === 'GET' && url.pathname === '/sessions/1/stream') {
      response.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-cache',
        connection: 'keep-alive',
      })
      response.flushHeaders()
      return
    }
    if (request.method === 'POST' && url.pathname === '/sessions/1/status') {
      json({ ok: true })
      markActive()
      return
    }
    if (request.method === 'POST' && url.pathname === '/sessions/1/turns/claim') {
      json({ kind: 'idle' })
      return
    }
    response.writeHead(404)
    response.end()
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  return { server, url: `http://127.0.0.1:${address.port}`, active }
}

const waitForExit = async (
  exited: Promise<unknown[]>,
  stderr: () => string,
): Promise<unknown[]> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      exited,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`session child did not exit after daemon stopped\n${stderr()}`)),
          2_000,
        )
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

test('session child releases supervisor IPC after the daemon stops', {
  timeout: 10_000,
}, async () => {
  const worktreePath = await mkdtemp(join(tmpdir(), 'baton-session-run-test-'))
  const stub = await startStubServer(worktreePath)
  const here = dirname(fileURLToPath(import.meta.url))
  const entry = join(here, '..', '..', 'index.ts')
  const tsx = createRequire(import.meta.url).resolve('tsx/cli')
  const child = spawn(
    process.execPath,
    [tsx, entry, 'session', 'run', '1', '--runner-token', 'runner-token'],
    {
      cwd: worktreePath,
      env: {
        ...process.env,
        BATON_SERVER: stub.url,
        BATON_WORKER_TOKEN: 'worker-token',
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  )
  let stderr = ''
  const childStderr = child.stderr
  assert.ok(childStderr)
  childStderr.setEncoding('utf8')
  childStderr.on('data', chunk => {
    stderr += chunk
  })
  const exited = once(child, 'exit')
  try {
    const [ready] = await once(child, 'message')
    assert.deepEqual(ready, { type: 'ready' })
    child.send({ type: 'execute' })
    await stub.active
    child.kill('SIGTERM')
    const [code, signal] = await waitForExit(exited, () => stderr)
    assert.equal(signal, null)
    assert.equal(code, 0, stderr)
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL')
      await exited
    }
    stub.server.closeAllConnections()
    await new Promise<void>((resolve, reject) => {
      stub.server.close(error => (error ? reject(error) : resolve()))
    })
    await rm(worktreePath, { recursive: true, force: true })
  }
})
