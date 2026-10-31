import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { FILE_DOWNLOAD_MAX_BYTES, type WorkerCommand } from '@baton/shared'
import { createApp } from '../app.ts'
import { createCommandBus } from '../command-bus.ts'
import { createFileDownloads } from '../file-downloads.ts'
import { freshStore, type TestStore } from '../store/test-db.ts'
import { seedWorker } from './test-helpers.ts'

const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` })

type DownloadCommand = Extract<WorkerCommand, { cmd: 'files.download' }>

// A stream that hands out `chunks` one read at a time, then ends or fails.
const chunked = (chunks: Uint8Array[], end: 'close' | 'error' = 'close') =>
  new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks.shift()
      if (next) controller.enqueue(next)
      else if (end === 'close') controller.close()
      else controller.error(new Error('worker went away'))
    },
  })

describe('server HTTP — file downloads', () => {
  let ctx: TestStore
  beforeEach(async () => {
    ctx = await freshStore()
  })
  afterEach(async () => {
    await ctx.cleanup()
  })

  const setup = async (options: { startTimeoutMs?: number; transferTimeoutMs?: number } = {}) => {
    const commands = createCommandBus()
    const downloads = createFileDownloads(commands, options)
    const app = createApp(ctx.store, { commands, downloads })
    const seeded = await seedWorker(app)
    const download = (query: string, init?: RequestInit) =>
      app.request(`/workers/${seeded.workerId}/download?${query}`, init)
    // Resolves with the next files.download the worker receives over its command stream.
    const nextDownload = (): Promise<DownloadCommand> =>
      new Promise(resolve => {
        const unsubscribe = commands.subscribe(seeded.workerId, command => {
          if (command.cmd !== 'files.download') return
          unsubscribe()
          resolve(command)
        })
      })
    const upload = (
      requestId: string,
      body: ReadableStream<Uint8Array> | string,
      headers: Record<string, string>,
      token = seeded.workerToken,
    ) =>
      app.request(`/workers/me/files/downloads/${requestId}`, {
        method: 'PUT',
        body,
        headers: { ...headers, ...auth(token) },
        ...(typeof body === 'string' ? {} : { duplex: 'half' }),
      } as RequestInit)
    const sendBytes = (requestId: string, body: ReadableStream<Uint8Array>, length: number) =>
      upload(requestId, body, {
        'content-type': 'application/octet-stream',
        'content-length': String(length),
      })
    const sendFailure = (requestId: string, failure: unknown) =>
      upload(requestId, JSON.stringify(failure), { 'content-type': 'application/json' })
    return { app, seeded, downloads, download, nextDownload, upload, sendBytes, sendFailure }
  }

  test('the worker streams the original bytes to the browser under the file name', async () => {
    const { download, nextDownload, sendBytes } = await setup()
    const bytes = [new Uint8Array([0, 1, 2]), new Uint8Array([0xff, 0xfe])]
    const received = nextDownload()
    const response = download('branch=feat%2Fx&path=docs%2F%E6%8A%A5%E5%91%8A.docx')
    const command = await received
    assert.deepEqual(command.query, { branch: 'feat/x', path: 'docs/报告.docx' })
    const put = sendBytes(command.requestId, chunked([...bytes]), 5)
    const res = await response
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/octet-stream')
    assert.equal(res.headers.get('content-length'), '5')
    assert.equal(res.headers.get('cache-control'), 'private, no-store')
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff')
    assert.equal(res.headers.get('content-security-policy'), "default-src 'none'; sandbox")
    assert.equal(
      res.headers.get('content-disposition'),
      `attachment; filename="__.docx"; filename*=UTF-8''%E6%8A%A5%E5%91%8A.docx`,
    )
    assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [0, 1, 2, 0xff, 0xfe])
    const done = await put
    assert.equal(done.status, 200)
    assert.deepEqual(await done.json(), { ok: true })
    // Finished requests are gone.
    assert.equal((await sendBytes(command.requestId, chunked([]), 0)).status, 404)
  })

  test('an empty file downloads as zero bytes', async () => {
    const { download, nextDownload, sendBytes } = await setup()
    const received = nextDownload()
    const response = download('branch=main&path=empty.bin')
    const put = sendBytes((await received).requestId, chunked([]), 0)
    const res = await response
    assert.equal(res.status, 200)
    assert.equal((await res.arrayBuffer()).byteLength, 0)
    assert.equal((await put).status, 200)
  })

  test('a failure the worker reports is mapped to its status before any bytes', async () => {
    const { download, nextDownload, sendFailure } = await setup()
    const received = nextDownload()
    const response = download('branch=main&path=big.zip')
    const reported = await sendFailure((await received).requestId, {
      ok: false,
      code: 'file_too_large',
      message: 'too large',
    })
    assert.equal(reported.status, 200)
    const res = await response
    assert.equal(res.status, 413)
    assert.deepEqual(await res.json(), { error: 'too large', code: 'file_too_large' })
  })

  test('an upload without a valid length or over the limit is refused and fails the download', async () => {
    const { download, nextDownload, upload, sendBytes } = await setup()
    const first = nextDownload()
    const missing = download('branch=main&path=a.bin')
    const noLength = await upload((await first).requestId, 'abc', {
      'content-type': 'application/octet-stream',
      'content-length': 'abc',
    })
    assert.equal(noLength.status, 400)
    assert.equal((await missing).status, 502)

    const second = nextDownload()
    const oversize = download('branch=main&path=b.bin')
    const refused = await sendBytes(
      (await second).requestId,
      chunked([]),
      FILE_DOWNLOAD_MAX_BYTES + 1,
    )
    assert.equal(refused.status, 413)
    assert.equal((await oversize).status, 413)
  })

  test('only the worker the request went to may answer it', async () => {
    const { seeded, download, nextDownload, upload, sendBytes } = await setup({
      startTimeoutMs: 200,
    })
    const other = await ctx.store.workers.register({
      projectId: seeded.projectId,
      machineId: 'mid-other',
      name: 'other',
      hostname: 'h-other',
    })
    if (other.kind === 'name-collision') throw new Error('unexpected worker name collision')
    const received = nextDownload()
    const response = download('branch=main&path=a.bin')
    const { requestId } = await received
    const forged = await upload(
      requestId,
      'x',
      { 'content-type': 'application/octet-stream', 'content-length': '1' },
      other.apiToken,
    )
    assert.equal(forged.status, 404)
    assert.equal((await sendBytes('not-a-request', chunked([]), 0)).status, 404)
    const res = await response
    assert.equal(res.status, 504)
    assert.equal(((await res.json()) as { code: string }).code, 'worker_timeout')
  })

  test('malformed paths, workers, and users outside the project cannot download', async () => {
    const { seeded, download } = await setup()
    assert.equal((await download('branch=main&path=..%2Fsecret')).status, 400)
    assert.equal((await download('branch=main&path=')).status, 400)
    const outsider = await ctx.store.users.create({
      username: 'outsider',
      passwordHash: 'x',
      isAdmin: false,
    })
    await ctx.store.users.setApiToken(outsider.id, 'tok-outsider')
    // With a user registered, bearer tokens are checked: a worker's is not a reader's.
    assert.equal(
      (await download('branch=main&path=a.bin', { headers: auth(seeded.workerToken) })).status,
      403,
    )
    assert.equal(
      (await download('branch=main&path=a.bin', { headers: auth('tok-outsider') })).status,
      404,
    )
  })

  test('an upload that breaks off or misstates its length fails the browser download', async () => {
    const { download, nextDownload, sendBytes } = await setup()
    for (const [body, length] of [
      [chunked([new Uint8Array([1, 2])], 'error'), 4],
      [chunked([new Uint8Array([1, 2])]), 4],
      [chunked([new Uint8Array([1, 2, 3, 4, 5])]), 4],
    ] as const) {
      const received = nextDownload()
      const response = download('branch=main&path=a.bin')
      const put = sendBytes((await received).requestId, body, length)
      const res = await response
      assert.equal(res.status, 200)
      await assert.rejects(res.arrayBuffer())
      assert.equal((await put).status, 502)
    }
  })

  test('a cancelled or stalled transfer, or a worker going away, ends both sides', async () => {
    const { download, downloads, seeded, nextDownload, sendBytes } = await setup({
      transferTimeoutMs: 200,
    })
    // The browser cancels mid-transfer: the upload is released.
    const first = nextDownload()
    const browser = new AbortController()
    const cancelled = download('branch=main&path=a.bin', { signal: browser.signal })
    const endless = new ReadableStream<Uint8Array>({ pull: c => c.enqueue(new Uint8Array(1)) })
    const put = sendBytes((await first).requestId, endless, 1_000_000)
    const reader = (await cancelled).body?.getReader()
    await reader?.read()
    await reader?.cancel()
    assert.equal((await put).status, 502)

    // The worker stalls: the transfer times out.
    const second = nextDownload()
    const stalled = download('branch=main&path=b.bin')
    const silent = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => {}) })
    const stalledPut = sendBytes((await second).requestId, silent, 10)
    await assert.rejects((await stalled).arrayBuffer())
    assert.equal((await stalledPut).status, 502)

    // The worker disconnects before answering.
    const third = nextDownload()
    const orphaned = download('branch=main&path=c.bin')
    await third
    downloads.forgetWorker(seeded.workerId)
    const res = await orphaned
    assert.equal(res.status, 409)
    assert.equal(((await res.json()) as { code: string }).code, 'worker_offline')
  })
})
