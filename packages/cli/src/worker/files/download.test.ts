import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, test } from 'node:test'
import { FILE_DOWNLOAD_MAX_BYTES, type FileDownloadQuery, type FileReply } from '@baton/shared'
import { filesClient } from '../../client/files.ts'
import { FileError } from './common.ts'
import { openFileDownload, sendFileDownload } from './download.ts'

const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-C', cwd, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args], {
    encoding: 'utf8',
  })

const write = (path: string, content: string | Buffer): void => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

// Every byte value, so any text decoding along the way would show.
const BINARY = Buffer.from(Array.from({ length: 256 }, (_, index) => index))

const readAll = async (body: ReadableStream<Uint8Array>): Promise<Buffer> =>
  Buffer.from(await new Response(body).arrayBuffer())

describe('worker files — downloads from a real repository', () => {
  let tmp: string
  let repo: string
  const signal = new AbortController().signal
  const open = (query: FileDownloadQuery, abort = signal) => openFileDownload(repo, query, abort)
  const failure = async (query: FileDownloadQuery): Promise<string> => {
    try {
      ;(await open(query)).close()
      return 'ok'
    } catch (error) {
      if (error instanceof FileError) return error.code
      throw error
    }
  }

  before(() => {
    tmp = realpathSync(mkdtempSync(join(tmpdir(), 'baton-download-')))
    repo = join(tmp, 'repo')
    git(tmp, 'init', '-q', '-b', 'main', repo)
    write(join(repo, 'docs/report.docx'), 'committed')
    write(join(repo, 'secrets/.env'), 'TOKEN=x')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'init')
    // `archive` gets its commit through a temporary worktree, then has none.
    const archive = join(tmp, 'archive')
    git(repo, 'worktree', 'add', '-q', '-b', 'archive', archive)
    write(join(archive, 'data/table.xlsx'), BINARY)
    symlinkSync('../docs/report.docx', join(archive, 'data/link.docx'))
    git(archive, 'add', '.')
    git(archive, 'commit', '-q', '-m', 'archive')
    git(repo, 'worktree', 'remove', archive)
    // Uncommitted state of the checked-out branch.
    write(join(repo, 'docs/report.docx'), 'edited, not committed')
    write(join(repo, 'empty.bin'), '')
    write(join(tmp, 'outside.bin'), 'outside')
    symlinkSync('../outside.bin', join(repo, 'escape.bin'))
  })
  after(() => rmSync(tmp, { recursive: true, force: true }))

  test('a checked-out branch serves its disk, uncommitted edits included', async () => {
    const source = await open({ branch: 'main', path: 'docs/report.docx' })
    assert.equal(source.size, 'edited, not committed'.length)
    assert.equal((await readAll(source.body)).toString(), 'edited, not committed')
  })

  test('another branch serves its committed bytes unchanged, without a checkout', async () => {
    const source = await open({ branch: 'archive', path: 'data/table.xlsx' })
    assert.equal(source.size, BINARY.length)
    assert.deepEqual(await readAll(source.body), BINARY)
    assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'HEAD').trim(), 'main')
  })

  test('an empty file downloads as zero bytes', async () => {
    const source = await open({ branch: 'main', path: 'empty.bin' })
    assert.equal(source.size, 0)
    assert.equal((await readAll(source.body)).length, 0)
  })

  test('the download limit includes its boundary', async () => {
    write(join(repo, 'limit.bin'), '')
    truncateSync(join(repo, 'limit.bin'), FILE_DOWNLOAD_MAX_BYTES)
    const source = await open({ branch: 'main', path: 'limit.bin' })
    assert.equal((await readAll(source.body)).length, FILE_DOWNLOAD_MAX_BYTES)
    truncateSync(join(repo, 'limit.bin'), FILE_DOWNLOAD_MAX_BYTES + 1)
    assert.equal(await failure({ branch: 'main', path: 'limit.bin' }), 'file_too_large')
  })

  test('protected, escaping, missing, and non-file paths are refused', async () => {
    const refused = await Promise.all(
      [
        { branch: 'main', path: 'secrets/.env' },
        { branch: 'main', path: '.git/config' },
        { branch: 'main', path: '../outside.bin' },
        { branch: 'main', path: 'escape.bin' },
        { branch: 'main', path: 'docs' },
        { branch: 'archive', path: 'data/link.docx' },
        { branch: 'archive', path: 'data' },
        { branch: 'gone', path: 'docs/report.docx' },
      ].map(failure),
    )
    assert.deepEqual(refused, [
      'forbidden_path',
      'forbidden_path',
      'invalid_request',
      'file_not_found',
      'file_not_found',
      'file_not_found',
      'file_not_found',
      'branch_not_found',
    ])
  })

  test('a file that changes length while streaming fails the stream', async () => {
    write(join(repo, 'growing.log'), 'start')
    const source = await open({ branch: 'main', path: 'growing.log' })
    appendFileSync(join(repo, 'growing.log'), ' and more')
    await assert.rejects(readAll(source.body), /grew past/)
  })

  test('aborting ends a stream from disk or from Git', async () => {
    for (const query of [
      { branch: 'main', path: 'limit.bin' },
      { branch: 'archive', path: 'data/table.xlsx' },
    ]) {
      const abort = new AbortController()
      truncateSync(join(repo, 'limit.bin'), 1024 * 1024)
      const source = await open(query, abort.signal)
      abort.abort()
      await assert.rejects(readAll(source.body))
      source.close()
    }
  })

  test('the daemon streams the file to the server, or reports why it cannot', async () => {
    const received: { headers: Record<string, unknown>; body: Buffer }[] = []
    const server = createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', chunk => chunks.push(chunk))
      req.on('end', () => {
        received.push({ headers: req.headers, body: Buffer.concat(chunks) })
        res.setHeader('content-type', 'application/json')
        res.end('{"ok":true}')
      })
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    const client = filesClient(`http://127.0.0.1:${port}`)
    try {
      const command = (requestId: string, path: string) =>
        ({ cmd: 'files.download', requestId, query: { branch: 'archive', path } }) as const
      await sendFileDownload(repo, command('r1', 'data/table.xlsx'), client, signal)
      await sendFileDownload(repo, command('r2', 'data/missing.bin'), client, signal)
      const [upload, rejected] = received
      assert.equal(upload?.headers['content-type'], 'application/octet-stream')
      assert.equal(upload?.headers['content-length'], String(BINARY.length))
      assert.deepEqual(upload?.body, BINARY)
      assert.equal(rejected?.headers['content-type'], 'application/json')
      const reply = JSON.parse(rejected?.body.toString() ?? '') as FileReply
      assert.deepEqual(reply.ok ? null : reply.code, 'file_not_found')
    } finally {
      server.close()
    }
  })
})
