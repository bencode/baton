import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { createServer, type ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import type { WorkerCreation, WorkerCreationReport } from '@baton/shared'
import { setAuthHeaders } from '../client/request.ts'
import { createProvisionerClient } from './client.ts'
import type { ProvisionerConfig } from './config.ts'
import { runProvisioner } from './daemon.ts'

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 5000
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for provisioner')
    await setTimeout(10)
  }
}
const record = (id: number, status: WorkerCreation['status'] = 'pending'): WorkerCreation => ({
  id,
  projectId: 3,
  name: `worker-${id}`,
  templateId: 'mini-local',
  agentKind: 'codex',
  machineId: `machine-${id}`,
  status,
  step: status === 'running' ? 'start' : null,
  error: null,
  repoPath: null,
  workerId: null,
  createdAt: 0,
  updatedAt: 0,
  finishedAt: null,
})
const harness = async (creations: WorkerCreation[]) => {
  const dir = await mkdtemp(join(tmpdir(), 'baton-provisioner-stream-'))
  const records = new Map(creations.map(c => [c.id, c]))
  const requests: { path: string; auth?: string }[] = []
  const reports: { id: number; report: WorkerCreationReport }[] = []
  const streams: ServerResponse[] = []
  let holdDirectory = false
  let directoryResponse: ServerResponse | undefined
  let rejectReports = false
  let streamStatus = 200
  const server = createServer(async (req, res) => {
    const path = req.url ?? ''
    requests.push({ path, auth: req.headers.authorization })
    if (path.endsWith('/stream')) {
      if (streamStatus !== 200) {
        res.writeHead(streamStatus).end()
        return
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' })
      res.write('retry: 20\n\n')
      streams.push(res)
      records.forEach(c => {
        res.write(
          `data: ${JSON.stringify({ action: c.status === 'running' ? 'inspect' : 'create', creationId: c.id })}\n\n`,
        )
      })
      return
    }
    res.setHeader('content-type', 'application/json')
    if (path === '/api/workers/7') {
      res.end(JSON.stringify({ id: 7, connected: true }))
      return
    }
    const id = Number(path.split('/')[4])
    const creation = records.get(id)
    if (!creation) {
      res.writeHead(404).end()
      return
    }
    if (path.endsWith('/worker')) {
      res.end(JSON.stringify({ worker: { id: 7 }, apiToken: 'worker-secret' }))
      return
    }
    if (path.endsWith('/progress')) {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const report = JSON.parse(Buffer.concat(chunks).toString()) as WorkerCreationReport
      if (rejectReports) {
        res.writeHead(500).end()
        return
      }
      reports.push({ id, report })
      Object.assign(creation, report)
      if (holdDirectory && report.status === 'running' && report.step === 'directory') {
        directoryResponse = res
        return
      }
    }
    res.end(JSON.stringify(creation))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const config: ProvisionerConfig = {
    server: `http://127.0.0.1:${address.port}/api`,
    token: 'provisioner-secret',
    projectsRoot: join(dir, 'projects'),
    cliPath: process.execPath,
    workerEnv: {},
    templates: {
      'mini-glm-codeplan': { workerEnv: {} },
      'mini-dashscope-codeplan': { workerEnv: {} },
      'mini-codex': { workerEnv: {} },
    },
  }
  return {
    config,
    records,
    reports,
    requests,
    streams,
    hold: () => {
      holdDirectory = true
    },
    release: () => {
      directoryResponse?.end(JSON.stringify(records.get(1)))
      holdDirectory = false
    },
    held: () => directoryResponse !== undefined,
    rejectReports: () => {
      rejectReports = true
    },
    rejectStream: (status: number) => {
      streamStatus = status
    },
    cleanup: async () => {
      server.closeAllConnections()
      await new Promise<void>((resolve, reject) =>
        server.close(error => (error ? reject(error) : resolve())),
      )
      await rm(dir, { recursive: true, force: true })
    },
  }
}

test('reconnect merges active hints, failure retains the directory and the next request still runs', {
  timeout: 10_000,
}, async () => {
  const f = await harness([record(1), record(2)])
  const abort = new AbortController()
  const firstRepo = join(f.config.projectsRoot, 'project-3/creation-1')
  await mkdir(firstRepo, { recursive: true })
  await mkdir(join(f.config.projectsRoot, 'project-3/creation-2'))
  f.hold()
  const run = runProvisioner(f.config, abort.signal)
  try {
    await waitFor(f.held)
    f.streams[0]?.write('data: {"action":"create","creationId":1}\n\n')
    f.streams[0]?.end()
    await waitFor(() => f.streams.length > 1)
    assert.equal(f.reports.filter(r => r.report.status === 'failed').length, 0)
    f.release()
    await waitFor(() => f.records.get(2)?.status === 'failed')
    assert.equal(f.requests.filter(r => r.path === '/api/provisioner/worker-creations/1').length, 1)
    assert.equal(f.reports.filter(r => r.id === 1 && r.report.status === 'failed').length, 1)
    assert.equal(f.reports.filter(r => r.id === 2 && r.report.status === 'running').length, 1)
    assert.ok(
      f.reports.every(
        r => r.report.status !== 'failed' || !r.report.error.includes(f.config.token),
      ),
    )
  } finally {
    abort.abort()
    await run
    await f.cleanup()
  }
})

test('restart fails abandoned running work and skips terminal records without creating resources', async () => {
  const f = await harness([record(1, 'running'), record(2, 'succeeded'), record(3, 'failed')])
  const abort = new AbortController()
  const run = runProvisioner(f.config, abort.signal)
  try {
    await waitFor(() => f.records.get(1)?.status === 'failed' && f.requests.length >= 5)
    assert.equal(f.reports.length, 1)
    assert.equal(f.reports[0]?.report.status, 'failed')
    const { access } = await import('node:fs/promises')
    await assert.rejects(access(f.config.projectsRoot), { code: 'ENOENT' })
  } finally {
    abort.abort()
    await run
    await f.cleanup()
  }
})

test('cannot report a failure exits so the supervisor can restart and stream conflicts also exit', async () => {
  const f = await harness([record(1, 'running')])
  f.rejectReports()
  try {
    await assert.rejects(runProvisioner(f.config, new AbortController().signal), /HTTP 500/)
    f.rejectStream(409)
    await assert.rejects(runProvisioner(f.config, new AbortController().signal), /HTTP 409/)
    f.rejectStream(503)
    await assert.rejects(runProvisioner(f.config, new AbortController().signal), /HTTP 503/)
  } finally {
    await f.cleanup()
  }
})

test('HTTP client uses dedicated preparation credentials and the worker token only for worker queries', async () => {
  const f = await harness([record(1)])
  setAuthHeaders({ authorization: 'Bearer unrelated-user-token' })
  try {
    const client = createProvisionerClient(f.config)
    await client.get(1)
    await client.report(1, { status: 'running', step: 'directory' })
    await client.register(1, 'mini')
    assert.equal((await client.worker(7, 'worker-secret')).connected, true)
    assert.deepEqual(
      f.requests.map(r => r.auth),
      [
        'Bearer provisioner-secret',
        'Bearer provisioner-secret',
        'Bearer provisioner-secret',
        'Bearer worker-secret',
      ],
    )
  } finally {
    setAuthHeaders({})
    await f.cleanup()
  }
})
