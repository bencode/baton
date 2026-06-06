import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { QueryFn } from './query.ts'
import { generateTitle, sanitizeTitle } from './title.ts'

// Fake claude that returns `out` as its result message.
const fakeQuery =
  (out: string): QueryFn =>
  () =>
    (async function* () {
      yield { type: 'result', subtype: 'success', is_error: false, result: out } as never
    })()

describe('sanitizeTitle', () => {
  test('strips quotes / leading label / newlines, collapses + caps', () => {
    assert.equal(sanitizeTitle('Title: "Fix the curl health check"\n'), 'Fix the curl health check')
    assert.equal(sanitizeTitle('  hello   world  '), 'hello world')
    assert.equal(sanitizeTitle('x'.repeat(60)).length, 30)
  })

  test('strips markdown, leading list markers, and trailing punctuation', () => {
    assert.equal(sanitizeTitle('**问题描述确认**：'), '问题描述确认')
    assert.equal(sanitizeTitle('## CardList 联动排查'), 'CardList 联动排查')
    assert.equal(sanitizeTitle('- 发货反馈字段排查。'), '发货反馈字段排查')
    assert.equal(sanitizeTitle('1. 移动端 RecordActions'), '移动端 RecordActions')
  })
})

describe('generateTitle', () => {
  const base = {
    worktreePath: '/tmp',
    userText: 'curl the health endpoint and report status',
    assistantText: 'I will hit /health and report the status.',
  }
  test('uses claude result when present', async () => {
    const t = await generateTitle({ ...base, queryFn: fakeQuery('  Curl Health Check  ') })
    assert.deepEqual(t, { kind: 'titled', title: 'Curl Health Check' })
  })
  test('declines when the model replies NONE', async () => {
    assert.deepEqual(await generateTitle({ ...base, queryFn: fakeQuery('NONE') }), {
      kind: 'declined',
    })
  })
  test('declines when claude emits nothing', async () => {
    assert.deepEqual(await generateTitle({ ...base, queryFn: fakeQuery('') }), {
      kind: 'declined',
    })
  })
  test('declines for a too-thin exchange without calling claude', async () => {
    const spy: QueryFn = () => {
      throw new Error('should not call claude for a trivial exchange')
    }
    assert.deepEqual(
      await generateTitle({
        worktreePath: '/tmp',
        userText: 'hi',
        assistantText: '',
        queryFn: spy,
      }),
      { kind: 'declined' },
    )
  })
  test('reports an error result subtype instead of declining', async () => {
    const erroring: QueryFn = () =>
      (async function* () {
        yield { type: 'result', subtype: 'error_during_execution', is_error: true } as never
      })()
    const t = await generateTitle({ ...base, queryFn: erroring })
    assert.equal(t.kind, 'error')
    assert.match((t as { reason: string }).reason, /error_during_execution/)
  })
  test('reports a thrown SDK error with its message', async () => {
    const throwing: QueryFn = () => ({
      [Symbol.asyncIterator]: () => ({
        next: () => Promise.reject(new Error('spawn reclaude ENOENT')),
      }),
    })
    const t = await generateTitle({ ...base, queryFn: throwing })
    assert.equal(t.kind, 'error')
    assert.match((t as { reason: string }).reason, /spawn reclaude ENOENT/)
  })
  test('reports a stream that ends without a result message', async () => {
    const silent: QueryFn = () => (async function* () {})()
    const t = await generateTitle({ ...base, queryFn: silent })
    assert.equal(t.kind, 'error')
    assert.match((t as { reason: string }).reason, /without a result/)
  })
})
