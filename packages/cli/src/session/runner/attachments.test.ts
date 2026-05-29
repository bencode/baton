import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import type { Attachment } from '@baton/shared'
import { augmentPrompt, materializeAttachments } from './attachments.ts'

const att = (id: string, filename: string): Attachment => ({
  id,
  sessionId: 1,
  filename,
  contentType: 'application/octet-stream',
  size: 0,
  url: `/sessions/1/attachments/${id}`,
  createdAt: 0,
})

// Fake fetch: each attachment url returns a body of its id, so we can assert
// which file got which bytes.
const fakeFetch = (async (url: string) => {
  const id = url.split('/').pop()
  return new Response(`bytes-${id}`)
}) as unknown as typeof fetch

describe('materializeAttachments', () => {
  let wt: string
  beforeEach(() => {
    wt = mkdtempSync(join(tmpdir(), 'baton-wt-'))
  })
  afterEach(() => {
    rmSync(wt, { recursive: true, force: true })
  })

  test('downloads into attachments/, writes .gitignore, dedupes name clashes', async () => {
    const rel = await materializeAttachments({
      worktreePath: wt,
      serverBase: 'http://srv',
      attachments: [att('a', 'foo.png'), att('b', 'foo.png'), att('c', 'bar.txt')],
      fetchImpl: fakeFetch,
    })
    assert.deepEqual(rel, ['attachments/foo.png', 'attachments/foo-1.png', 'attachments/bar.txt'])
    assert.equal(readFileSync(join(wt, 'attachments/foo.png'), 'utf8'), 'bytes-a')
    assert.equal(readFileSync(join(wt, 'attachments/foo-1.png'), 'utf8'), 'bytes-b')
    assert.equal(readFileSync(join(wt, 'attachments/bar.txt'), 'utf8'), 'bytes-c')
    assert.equal(readFileSync(join(wt, 'attachments/.gitignore'), 'utf8'), '*\n')
  })

  test('throws on a failed download', async () => {
    const failing = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch
    await assert.rejects(
      materializeAttachments({
        worktreePath: wt,
        serverBase: 'http://srv',
        attachments: [att('a', 'foo.png')],
        fetchImpl: failing,
      }),
    )
  })
})

describe('augmentPrompt', () => {
  test('prepends a file header before the text', () => {
    const out = augmentPrompt('describe these', ['attachments/a.png', 'attachments/b.pdf'])
    assert.match(out, /already saved in the working directory/)
    assert.match(out, /- attachments\/a\.png/)
    assert.match(out, /- attachments\/b\.pdf/)
    assert.ok(out.trimEnd().endsWith('describe these'))
  })

  test('no attachments → text unchanged; empty text → header only', () => {
    assert.equal(augmentPrompt('hi', []), 'hi')
    const headerOnly = augmentPrompt('', ['attachments/a.png'])
    assert.match(headerOnly, /- attachments\/a\.png/)
    assert.ok(!headerOnly.includes('\n\n'))
  })
})
